import * as records from "@/modules/records"
import * as media from "@/modules/media"
import { findOrCreateBike } from "@/modules/bikes"
import { assertActive, getContributor } from "@/modules/identity"
import { getSettings } from "@/modules/settings"
import {
  checkModeration,
  MODERATION_CONTACT_MESSAGE,
} from "@/modules/moderation"
import { AppError } from "@/infra/security"
import type { RideInput, RecordView } from "@/modules/records"
const defaultPorts = { media, checkModeration }
export function createPublishing(ports = defaultPorts) {
  return {
    async submit(
      authorId: string,
      input: RideInput,
      requestId: string,
      photo?: Buffer,
      id?: number
    ) {
      assertActive(authorId)
      const enabled = getSettings().moderationEnabled
      records.recoverStaleAttempts()
      const bike = findOrCreateBike(input.bikeNumber)
      const attempt = records.beginAttempt(
        authorId,
        bike.id,
        input,
        requestId,
        id
      )
      if (attempt.state !== "working")
        return {
          id: attempt.record_id,
          status: attempt.state,
          message: attempt.message || "已發布",
        }
      // Concurrent identical request cannot begin the same attempt twice: caller request lock is below.
      const recordId = attempt.record_id,
        version = attempt.version
      try {
        const previous = records.getRecord(recordId)!
        const sourcePhoto =
          photo ??
          (await ports.media.source(
            recordId,
            ports.media.latestSourceVersion(recordId) ?? previous.version
          ))
        // Persist input photo before moderation so a rejected first submission can be retried without upload.
        await ports.media.prepare(recordId, version, input, sourcePhoto)
        const outcome = await ports.checkModeration(
          {
            recordId,
            contentVersion: version,
            bikeNumber: input.bikeNumber,
            riddenOn: input.riddenOn,
            city: input.city,
            locationText: input.location,
            scores: Object.fromEntries(
              [
                "propulsion",
                "cleanliness",
                "handling",
                "condition",
                "sensor",
                "agility",
              ].map((key, i) => [key, input.scores[i]])
            ),
            overallGrade: input.overallGrade,
            impression: input.impression,
            shortComment: input.shortComment,
          },
          enabled
        )
        if (!["normal", "skipped"].includes(outcome.verdict)) {
          const message =
            outcome.verdict === "unavailable"
              ? "審核服務暫時無法使用，資料已保存，請稍後重試。"
              : MODERATION_CONTACT_MESSAGE
          records.failAttempt(requestId, message)
          return { id: recordId, status: "draft", message }
        }
        assertActive(authorId)
        const current = records.getRecord(recordId)
        if (current?.status === "hidden" || current?.status === "deleted")
          throw new AppError("紀錄已撤下", 409)
        await ports.media.publish(recordId, version)
        records.completeAttempt(requestId, bike.id)
        // A failed cleanup must never roll back a successfully committed new version.
        await ports.media
          .revokeObsoleteVersions(recordId, version)
          .catch(() =>
            console.error("obsolete_images_cleanup_pending", recordId)
          )
        return { id: recordId, status: "published", message: "發布成功" }
      } catch (error) {
        records.failAttempt(requestId, "處理失敗，草稿已保存，請重試")
        await ports.media.revokeVersion(recordId, version).catch(() => {})
        if (error instanceof AppError) throw error
        return {
          id: recordId,
          status: "draft",
          message: "圖片或儲存服務處理失敗，草稿已保存，請檢查照片或稍後重試",
        }
      }
    },
  }
}
const active = new Set<string>()
export async function submit(
  ...args: Parameters<ReturnType<typeof createPublishing>["submit"]>
) {
  if (active.size >= 2) throw new AppError("圖片服務忙碌中，請稍後重試", 429)
  const key = args[2]
  if (active.has(key)) throw new AppError("正在處理相同投稿", 409)
  active.add(key)
  try {
    return await createPublishing().submit(...args)
  } finally {
    active.delete(key)
  }
}
export function decorate(record: RecordView, owner = false): RecordView {
  const assets = media.list(record.id, record.version)
  const url = (kind: string) => {
    const a = assets.find((a) => a.kind === kind && a.visibility === "public")
    return a ? media.publicUrl(a) || undefined : undefined
  }
  return {
    ...record,
    authorCode: getContributor(record.authorId)?.publicCode || "",
    imageUrl:
      owner && record.status !== "published"
        ? `/api/records/${record.id}/photo`
        : url("display"),
    shareUrl: record.status === "published" ? url("share") : undefined,
  }
}
export async function withdraw(id: number, status: "hidden" | "deleted") {
  records.withdrawRecord(id, status)
  if (status === "deleted") await media.purgeRecord(id)
  else await media.revoke(id)
}
export async function restore(id: number) {
  const { record: r, revision } = records.restorationSnapshot(id)
  try {
    await media.restore(id, r.version)
    records.completeRestore(id, revision)
  } catch (error) {
    // Do not revoke assets if a competing restore has already made them public.
    if (records.getRecord(id)?.status !== "published")
      await media
        .revokeVersion(id, r.version)
        .catch(() => console.error("restore_cleanup_pending", id))
    throw error
  }
}
