import { afterEach, describe, it, expect, vi } from "vitest"
import sharp from "sharp"
import { createMedia } from "./index"
import { closeDb, getSqlite } from "../../infra/db"
import type { ObjectStorage } from "../storage"
import type { RideInput } from "../records/types"
const input: RideInput = {
  bikeNumber: "001",
  riddenOn: "2026-09-21",
  city: "台北",
  location: "",
  scores: [null, 1, 2, 3, 4, 5],
  overallGrade: "A+",
  impression: "",
  shortComment: "好騎",
  cropX: 0.5,
  cropY: 0.5,
}
afterEach(() => {
  closeDb()
  vi.unstubAllEnvs()
})
function setup() {
  vi.stubEnv("DATABASE_PATH", ":memory:")
  const db = getSqlite()
  db.prepare(
    "INSERT INTO contributors(id,public_code,recovery_hash) VALUES ('a','A','hash')"
  ).run()
  db.prepare("INSERT INTO bikes(bike_number) VALUES ('001')").run()
  db.prepare(
    "INSERT INTO ride_records(bike_id,author_id,content) VALUES (1,'a','{}')"
  ).run()
  const objects = new Map<string, Buffer>()
  let failPublic = false
  let failRemoval = false
  const storage: ObjectStorage = {
    async put(k, b, v) {
      if (failPublic && v === "public") throw Error("offline")
      objects.set(`${v}/${k}`, b)
    },
    async get(k, v) {
      const b = objects.get(`${v}/${k}`)
      if (!b) throw Error("missing")
      return b
    },
    async remove(k, v) {
      if (failRemoval && k.endsWith("mother.jpg") && v === "private")
        throw Error("offline")
      objects.delete(`${v}/${k}`)
    },
    publicUrl(k) {
      return "https://images.test/" + k
    },
  }
  return {
    media: createMedia(storage),
    objects,
    failRemoval: (value: boolean) => {
      failRemoval = value
    },
    fail: () => {
      failPublic = true
    },
  }
}
async function photo() {
  return sharp({
    create: { width: 200, height: 300, channels: 3, background: "#777" },
  })
    .jpeg()
    .toBuffer()
}
describe("media publication lifecycle", () => {
  it("stages privately, publishes derivatives, revokes and restores", async () => {
    const { media, objects } = setup()
    const assets = await media.prepare(1, 1, input, await photo())
    expect(assets).toHaveLength(4)
    expect([...objects.keys()].every((k) => k.startsWith("private/"))).toBe(
      true
    )
    await media.publish(1, 1)
    expect(
      media.list(1, 1).filter((a) => a.visibility === "public")
    ).toHaveLength(3)
    expect(objects.has("public/records/1/v1/mother.jpg")).toBe(false)
    await media.revoke(1)
    expect([...objects.keys()].every((k) => k.startsWith("private/"))).toBe(
      true
    )
    await media.restore(1, 1)
    expect(objects.has("public/records/1/v1/share.jpg")).toBe(true)
    await media.discardVersion(1, 1)
    expect(objects.size).toBe(0)
    expect(media.list(1, 1)).toEqual([])
  })
  it("keeps prepared source on failed public upload for retry", async () => {
    const { media, objects, fail } = setup()
    await media.prepare(1, 1, input, await photo())
    fail()
    await expect(media.publish(1, 1)).rejects.toThrow("offline")
    expect([...objects.keys()].every((k) => k.startsWith("private/"))).toBe(
      true
    )
    expect((await media.source(1, 1)).length).toBeGreaterThan(0)
  })
})

describe("permanent deletion", () => {
  it("purges all versions including private mothers and remains idempotent", async () => {
    const { media, objects } = setup()
    await media.prepare(1, 1, input, await photo())
    await media.publish(1, 1)
    await media.prepare(1, 2, input, await photo())
    await media.purgeRecord(1)
    expect(objects.size).toBe(0)
    expect(media.list(1, 1)).toEqual([])
    expect(media.list(1, 2)).toEqual([])
    await expect(media.purgeRecord(1)).resolves.toBeUndefined()
  })
  it("keeps only failed rows for a later retry", async () => {
    const { media, objects, failRemoval } = setup()
    await media.prepare(1, 1, input, await photo())
    await media.publish(1, 1)
    failRemoval(true)
    await expect(media.purgeRecord(1)).rejects.toThrow("待清理")
    expect(media.list(1, 1).map((asset) => asset.kind)).toEqual(["mother"])
    expect(objects.size).toBe(1)
    failRemoval(false)
    await media.purgeRecord(1)
    expect(objects.size).toBe(0)
    expect(media.list(1, 1)).toEqual([])
  })
})
