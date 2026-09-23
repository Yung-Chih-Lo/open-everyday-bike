import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, getSqlite } from "@/infra/db"
import { createIdentity, setContributorStatus } from "@/modules/identity"
import { createPublishing, restore } from "@/modules/publishing"
import * as media from "@/modules/media"
import { checkModeration } from "@/modules/moderation"
import {
  getRecord,
  listRecords,
  bikeHistory,
  owned,
  completeAttempt,
  withdrawRecord,
  restorationSnapshot,
  completeRestore,
} from "@/modules/records"
import { setModerationEnabled } from "@/modules/settings"
import type { RideInput } from "@/modules/records"

let directory: string
const input: RideInput = {
  bikeNumber: "0120297",
  riddenOn: "2026-09-21",
  city: "台北市",
  location: "公園旁",
  scores: [4, 3, null, 2, 5, 4],
  overallGrade: "A+",
  impression: "鏈條有聲音，整體仍好騎。",
  shortComment: "舒服",
  cropX: 0.5,
  cropY: 0.5,
}
function ports() {
  const provider = vi.fn(async () => ({
    choice: "normal" as "normal" | "abnormal",
    confidence: 1,
    model: "fixture",
  }))
  const photos = new Map<string, Buffer>()
  const fakeMedia = {
    ...media,
    prepare: vi.fn(
      async (id: number, version: number, _input: RideInput, photo: Buffer) => {
        photos.set(`${id}/${version}`, photo)
        return []
      }
    ),
    source: vi.fn(
      async (id: number, version: number) =>
        photos.get(`${id}/${version}`) ?? Buffer.from("photo")
    ),
    latestSourceVersion: vi.fn(
      (id: number) =>
        Math.max(
          0,
          ...Array.from(photos.keys())
            .filter((k) => k.startsWith(`${id}/`))
            .map((k) => Number(k.split("/")[1]))
        ) || undefined
    ),
    publish: vi.fn(async () => {}),
    revokeVersion: vi.fn(async () => {}),
    revokeObsoleteVersions: vi.fn(async () => {}),
  }
  const moderation: typeof checkModeration = (state, enabled) =>
    checkModeration(state, enabled, provider)
  return {
    provider,
    media: fakeMedia,
    app: createPublishing({ media: fakeMedia, checkModeration: moderation }),
  }
}
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "")
  closeDb()
  directory = mkdtempSync(join(tmpdir(), "ubike-publishing-"))
  vi.stubEnv("DATABASE_PATH", join(directory, "test.sqlite"))
  vi.stubEnv("TYPESAFE_API_KEY", "fixture-key")
  vi.stubEnv("MODERATION_DAILY_LIMIT", "100")
})
afterEach(() => {
  closeDb()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

describe("publishing with real SQLite and external seams", () => {
  it("publishes with moderation off without a provider call, retains zeros and independent grade", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "")
    const { contributor } = createIdentity(),
      p = ports()
    const result = await p.app.submit(
      contributor.id,
      input,
      "first",
      Buffer.from("photo")
    )
    expect(result.status).toBe("published")
    expect(p.provider).not.toHaveBeenCalled()
    expect(getRecord(result.id)?.content).toMatchObject({
      bikeNumber: "0120297",
      overallGrade: "A+",
      scores: [4, 3, null, 2, 5, 4],
    })
    expect(
      getSqlite().prepare("SELECT result FROM moderation_checks").get()
    ).toEqual({ result: "skipped" })
    expect(p.media.publish).toHaveBeenCalledWith(result.id, 1)
  })
  it("keeps rejected content private and reuses its photo after disabling moderation", async () => {
    const { contributor } = createIdentity(),
      p = ports()
    setModerationEnabled(true)
    p.provider.mockResolvedValue({
      choice: "abnormal",
      confidence: 1,
      model: "fixture",
    })
    const rejected = await p.app.submit(
      contributor.id,
      input,
      "reject",
      Buffer.from("photo")
    )
    expect(rejected.status).toBe("draft")
    expect(listRecords()).toHaveLength(0)
    expect(p.media.publish).not.toHaveBeenCalled()
    setModerationEnabled(false)
    const result = await p.app.submit(
      contributor.id,
      input,
      "retry",
      undefined,
      rejected.id
    )
    expect(result.status).toBe("published")
    expect(result.id).toBe(rejected.id)
    expect(p.media.source).toHaveBeenCalledWith(rejected.id, 1)
    expect(p.provider).toHaveBeenCalledTimes(1)
    expect(
      getSqlite()
        .prepare(
          "SELECT content_version,result FROM moderation_checks ORDER BY id"
        )
        .all()
    ).toEqual([
      { content_version: 1, result: "abnormal" },
      { content_version: 2, result: "skipped" },
    ])
  })
  it("preserves the published version when an edit fails and does not reuse old approval", async () => {
    const { contributor } = createIdentity(),
      p = ports()
    setModerationEnabled(true)
    const original = await p.app.submit(
      contributor.id,
      input,
      "original",
      Buffer.from("photo")
    )
    p.provider.mockResolvedValue({
      choice: "abnormal",
      confidence: 1,
      model: "fixture",
    })
    await p.app.submit(
      contributor.id,
      { ...input, shortComment: "新的評語" },
      "bad-edit",
      undefined,
      original.id
    )
    expect(getRecord(original.id)).toMatchObject({
      version: 1,
      status: "published",
      content: { shortComment: "舒服" },
    })
    expect(p.provider.mock.calls).toHaveLength(2)
    expect(p.media.publish).toHaveBeenCalledTimes(1)
    expect(() =>
      completeAttempt("bad-edit", getRecord(original.id)!.bikeId)
    ).toThrow("失效")
  })
  it("deduplicates completed requests, allows multiple rides, and enforces ownership", async () => {
    const author = createIdentity(),
      stranger = createIdentity(),
      p = ports()
    const first = await p.app.submit(
      author.contributor.id,
      input,
      "same",
      Buffer.from("photo")
    )
    const duplicate = await p.app.submit(
      author.contributor.id,
      input,
      "same",
      Buffer.from("photo")
    )
    expect(duplicate.id).toBe(first.id)
    expect(p.media.publish).toHaveBeenCalledTimes(1)
    const second = await p.app.submit(
      author.contributor.id,
      input,
      "another",
      Buffer.from("photo")
    )
    expect(second.id).toBeGreaterThan(first.id)
    expect(listRecords({ bikeId: getRecord(first.id)!.bikeId })).toHaveLength(2)
    expect(() => owned(first.id, stranger.contributor.id)).toThrow("找不到")
    await expect(
      p.app.submit(
        stranger.contributor.id,
        input,
        "foreign-edit",
        undefined,
        first.id
      )
    ).rejects.toThrow("找不到")
  })
  it("prevents disabled authors from publishing and keeps failed media as a retryable draft", async () => {
    const author = createIdentity(),
      p = ports()
    p.media.prepare.mockRejectedValueOnce(new Error("offline"))
    await expect(
      p.app.submit(
        author.contributor.id,
        input,
        "media-failure",
        Buffer.from("photo")
      )
    ).resolves.toMatchObject({ status: "draft" })
    expect(listRecords()).toHaveLength(0)
    expect(listRecords({ authorId: author.contributor.id })[0].status).toBe(
      "draft"
    )
    expect(p.media.revokeVersion).toHaveBeenCalled()
    setContributorStatus(author.contributor.id, true)
    await expect(
      p.app.submit(
        author.contributor.id,
        input,
        "disabled",
        Buffer.from("photo")
      )
    ).rejects.toThrow("停用")
  })
  it("uses the settings snapshot taken before asynchronous media preparation", async () => {
    const author = createIdentity(),
      p = ports()
    p.media.prepare.mockImplementationOnce(async () => {
      setModerationEnabled(true)
      return []
    })
    await p.app.submit(
      author.contributor.id,
      input,
      "snapshot",
      Buffer.from("photo")
    )
    expect(p.provider).not.toHaveBeenCalled()
    await p.app.submit(
      author.contributor.id,
      input,
      "next-request",
      Buffer.from("photo")
    )
    expect(p.provider).toHaveBeenCalledTimes(1)
  })
  it("reuses the new draft photo after a rejected edit instead of the old public photo", async () => {
    const author = createIdentity(),
      p = ports()
    const initial = await p.app.submit(
      author.contributor.id,
      input,
      "photo-first",
      Buffer.from("old")
    )
    setModerationEnabled(true)
    p.provider.mockResolvedValue({
      choice: "abnormal",
      confidence: 1,
      model: "fixture",
    })
    await p.app.submit(
      author.contributor.id,
      { ...input, shortComment: "新照片" },
      "photo-edit",
      Buffer.from("new"),
      initial.id
    )
    setModerationEnabled(false)
    await p.app.submit(
      author.contributor.id,
      { ...input, shortComment: "新照片" },
      "photo-retry",
      undefined,
      initial.id
    )
    expect(p.media.source).toHaveBeenLastCalledWith(initial.id, 2)
    expect(p.media.prepare.mock.calls.at(-1)?.[3].toString()).toBe("new")
  })
  it("commits the new publication even if obsolete image cleanup fails", async () => {
    const author = createIdentity(),
      p = ports()
    const original = await p.app.submit(
      author.contributor.id,
      input,
      "cleanup-first",
      Buffer.from("photo")
    )
    p.media.revokeObsoleteVersions.mockRejectedValueOnce(
      new Error("storage offline")
    )
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const edit = await p.app.submit(
      author.contributor.id,
      { ...input, shortComment: "新版" },
      "cleanup-edit",
      undefined,
      original.id
    )
    expect(edit.status).toBe("published")
    expect(getRecord(original.id)?.content.shortComment).toBe("新版")
    expect(p.media.revokeVersion).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      "obsolete_images_cleanup_pending",
      original.id
    )
    log.mockRestore()
  })
  it("never restores deleted content and invalidates stale restoration", async () => {
    const author = createIdentity(),
      p = ports()
    const original = await p.app.submit(
      author.contributor.id,
      input,
      "lifecycle-first",
      Buffer.from("photo")
    )
    withdrawRecord(original.id, "hidden")
    const beforeDelete = restorationSnapshot(original.id)
    withdrawRecord(original.id, "deleted")
    expect(() => completeRestore(original.id, beforeDelete.revision)).toThrow(
      "狀態已變更"
    )
    expect(() => withdrawRecord(original.id, "hidden")).toThrow("已刪除")
    expect(() => restorationSnapshot(original.id)).toThrow("無法恢復")
    expect(getRecord(original.id)?.status).toBe("deleted")
  })
  it("cancels an earlier restore even when a second hide leaves the same status", async () => {
    const author = createIdentity(),
      p = ports()
    const original = await p.app.submit(
      author.contributor.id,
      input,
      "rehide-first",
      Buffer.from("photo")
    )
    withdrawRecord(original.id, "hidden")
    const beforeHide = restorationSnapshot(original.id)
    withdrawRecord(original.id, "hidden")
    expect(() => completeRestore(original.id, beforeHide.revision)).toThrow(
      "狀態已變更"
    )
  })
  it("cleans restored assets when deletion wins during asynchronous storage work", async () => {
    const author = createIdentity(),
      p = ports()
    const original = await p.app.submit(
      author.contributor.id,
      input,
      "race-first",
      Buffer.from("photo")
    )
    withdrawRecord(original.id, "hidden")
    const restoreMedia = vi
      .spyOn(media, "restore")
      .mockImplementation(async () => {
        withdrawRecord(original.id, "deleted")
      })
    const revoke = vi.spyOn(media, "revokeVersion").mockResolvedValue()
    await expect(restore(original.id)).rejects.toThrow("狀態已變更")
    expect(getRecord(original.id)?.status).toBe("deleted")
    expect(revoke).toHaveBeenCalledWith(original.id, 1)
    restoreMedia.mockRestore()
    revoke.mockRestore()
  })
  it("cannot finish an in-flight edit after hiding and restoring the earlier public version", async () => {
    const author = createIdentity(),
      p = ports()
    const original = await p.app.submit(
      author.contributor.id,
      input,
      "inflight-first",
      Buffer.from("photo")
    )
    p.media.publish.mockImplementationOnce(async () => {
      withdrawRecord(original.id, "hidden")
      const snapshot = restorationSnapshot(original.id)
      completeRestore(original.id, snapshot.revision)
    })
    await expect(
      p.app.submit(
        author.contributor.id,
        { ...input, shortComment: "失效的新版" },
        "inflight-edit",
        undefined,
        original.id
      )
    ).rejects.toThrow("失效")
    expect(getRecord(original.id)?.content.shortComment).toBe("舒服")
    expect(p.media.revokeVersion).toHaveBeenCalledWith(original.id, 2)
  })
})

it("paginates all public bike history with stable ordering and excludes hidden records", async () => {
  const { contributor } = createIdentity()
  const p = ports()
  const ids: number[] = []
  for (let i = 0; i < 26; i++) {
    const r = await p.app.submit(
      contributor.id,
      input,
      `page-${i}`,
      Buffer.from("photo")
    )
    ids.push(r.id)
  }
  withdrawRecord(ids[25], "hidden")
  const bikeId = getRecord(ids[0])!.bikeId
  await p.app.submit(
    contributor.id,
    { ...input, bikeNumber: "9999999" },
    "other-bike",
    Buffer.from("photo")
  )
  const first = bikeHistory(bikeId, 1),
    second = bikeHistory(bikeId, 2),
    last = bikeHistory(bikeId, 999)
  expect(first).toMatchObject({
    total: 25,
    page: 1,
    pages: 3,
    latestRiddenOn: input.riddenOn,
  })
  expect(first.records.map((r) => r.id)).toEqual(ids.slice(13, 25).reverse())
  expect(second.records.map((r) => r.id)).toEqual(ids.slice(1, 13).reverse())
  expect(last.records.map((r) => r.id)).toEqual([ids[0]])
  expect(last.page).toBe(3)
  expect(bikeHistory(bikeId, -1).page).toBe(1)
  expect(bikeHistory(bikeId, NaN).page).toBe(1)
  expect(bikeHistory(9999)).toMatchObject({
    total: 0,
    page: 1,
    pages: 1,
    records: [],
  })
})
