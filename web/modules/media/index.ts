import { decodeHeic, isHeic } from "./heic"
import sharp from "sharp"
import { getSqlite } from "../../infra/db"
import { getStorage, type ObjectStorage } from "../storage"
import { renderShareCard, TEMPLATE_VERSION } from "../share-card"
import type { RideInput } from "../records/types"
export type Asset = {
  id: number
  record_id: number
  content_version: number
  kind: "mother" | "thumbnail" | "display" | "share"
  object_key: string
  visibility: "private" | "public"
  mime_type: string
  width: number
  height: number
  bytes: number
  status: string
  template_version: number
}
export async function normalizePhoto(buffer: Buffer): Promise<Buffer> {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new Error("照片不得超過 10 MB")
  const source = isHeic(buffer) ? await decodeHeic(buffer) : buffer
  const image = sharp(source, { limitInputPixels: 25_000_000, animated: false })
  const meta = await image.metadata()
  if (
    !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
    (meta.pages ?? 1) > 1
  )
    throw new Error("請上傳 JPEG、PNG、WebP 或 HEIC／HEIF 靜態照片")
  if (!meta.width || !meta.height || meta.width * meta.height > 25_000_000)
    throw new Error("照片不得超過 25 MP")
  return image.rotate().jpeg({ quality: 92 }).toBuffer()
}
export async function previewPhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(await normalizePhoto(buffer))
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()
}
export function createMedia(storage: ObjectStorage) {
  const list = (recordId: number, version: number): Asset[] =>
    getSqlite()
      .prepare(
        "SELECT * FROM record_images WHERE record_id=? AND content_version=? ORDER BY id"
      )
      .all(recordId, version) as Asset[]
  return {
    list,
    async prepare(
      recordId: number,
      version: number,
      input: RideInput,
      buffer: Buffer
    ): Promise<Asset[]> {
      const mother = await normalizePhoto(buffer)
      const outputs: { kind: Asset["kind"]; body: Buffer }[] = [
        { kind: "mother", body: mother },
        {
          kind: "thumbnail",
          body: await sharp(mother)
            .resize({
              width: 420,
              height: 420,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 78 })
            .toBuffer(),
        },
        {
          kind: "display",
          body: await sharp(mother)
            .resize({
              width: 1600,
              height: 1600,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85 })
            .toBuffer(),
        },
        { kind: "share", body: await renderShareCard(recordId, input, mother) },
      ]
      for (const { kind, body } of outputs) {
        const key = `records/${recordId}/v${version}/${kind}.jpg`
        const metadata = await sharp(body).metadata()
        // Persist intent first, so an interrupted upload remains discoverable for cleanup/retry.
        getSqlite()
          .prepare(
            `INSERT INTO record_images(record_id,content_version,kind,object_key,visibility,mime_type,width,height,bytes,status,template_version) VALUES(?,?,?,?,'private','image/jpeg',?,?,?,'processing',?) ON CONFLICT(record_id,content_version,kind) DO UPDATE SET status='processing',width=excluded.width,height=excluded.height,bytes=excluded.bytes`
          )
          .run(
            recordId,
            version,
            kind,
            key,
            metadata.width!,
            metadata.height!,
            body.length,
            TEMPLATE_VERSION
          )
        await storage.put(key, body, "private", "image/jpeg")
        getSqlite()
          .prepare("UPDATE record_images SET status='ready' WHERE object_key=?")
          .run(key)
      }
      return list(recordId, version)
    },
    async source(recordId: number, version: number): Promise<Buffer> {
      const asset = list(recordId, version).find(
        (a) => a.kind === "mother" && a.status === "ready"
      )
      if (!asset) throw new Error("找不到原始照片，請重新上傳")
      return storage.get(asset.object_key, "private")
    },
    async publish(recordId: number, version: number) {
      const assets = list(recordId, version)
      if (assets.length !== 4 || assets.some((a) => a.status !== "ready"))
        throw new Error("圖片尚未處理完成")
      const derivatives = assets.filter((a) => a.kind !== "mother")
      try {
        for (const asset of derivatives) {
          await storage.put(
            asset.object_key,
            await storage.get(asset.object_key, "private"),
            "public",
            asset.mime_type
          )
          getSqlite()
            .prepare("UPDATE record_images SET visibility='public' WHERE id=?")
            .run(asset.id)
        }
      } catch (error) {
        // The caller keeps the record unpublished; remove even ambiguous successful uploads.
        for (const asset of derivatives) {
          try {
            await storage.remove(asset.object_key, "public")
            getSqlite()
              .prepare(
                "UPDATE record_images SET visibility='private' WHERE id=?"
              )
              .run(asset.id)
          } catch {
            /* Kept in DB for an explicit cleanup retry. */
          }
        }
        throw error
      }
    },
    async revokeVersion(recordId: number, version: number) {
      for (const asset of list(recordId, version).filter(
        (a) => a.kind !== "mother"
      )) {
        await storage.remove(asset.object_key, "public")
        getSqlite()
          .prepare("UPDATE record_images SET visibility='private' WHERE id=?")
          .run(asset.id)
      }
    },
    async revoke(recordId: number) {
      const assets = getSqlite()
        .prepare(
          "SELECT * FROM record_images WHERE record_id=? AND kind!='mother'"
        )
        .all(recordId) as Asset[]
      for (const asset of assets) {
        await storage.remove(asset.object_key, "public")
        getSqlite()
          .prepare("UPDATE record_images SET visibility='private' WHERE id=?")
          .run(asset.id)
      }
    },
    async restore(recordId: number, version: number) {
      await this.publish(recordId, version)
    },
    async purgeRecord(recordId: number): Promise<void> {
      const assets = getSqlite()
        .prepare("SELECT * FROM record_images WHERE record_id=? ORDER BY id")
        .all(recordId) as Asset[]
      let failures = 0
      for (const asset of assets) {
        // Delete both locations even if an earlier upload had an ambiguous result.
        const results = await Promise.allSettled([
          storage.remove(asset.object_key, "public"),
          storage.remove(asset.object_key, "private"),
        ])
        if (results.some((result) => result.status === "rejected")) {
          failures++
          continue
        }
        getSqlite()
          .prepare("DELETE FROM record_images WHERE id=?")
          .run(asset.id)
      }
      if (failures) throw new Error(`仍有 ${failures} 張圖片待清理，請重試`)
    },
    async discardVersion(recordId: number, version: number) {
      for (const asset of list(recordId, version)) {
        await storage.remove(asset.object_key, "public")
        await storage.remove(asset.object_key, "private")
        getSqlite()
          .prepare("DELETE FROM record_images WHERE id=?")
          .run(asset.id)
      }
    },
    publicUrl(asset: Asset) {
      return asset.visibility === "public"
        ? storage.publicUrl(asset.object_key)
        : null
    },
  }
}
export function getMedia() {
  return createMedia(getStorage())
}
export const prepare = (
  recordId: number,
  version: number,
  input: RideInput,
  buffer: Buffer
) => getMedia().prepare(recordId, version, input, buffer)
export const source = (recordId: number, version: number) =>
  getMedia().source(recordId, version)
export const publish = (recordId: number, version: number) =>
  getMedia().publish(recordId, version)
export const revoke = (recordId: number) => getMedia().revoke(recordId)
export const restore = (recordId: number, version: number) =>
  getMedia().restore(recordId, version)
export const discardVersion = (recordId: number, version: number) =>
  getMedia().discardVersion(recordId, version)
export function list(recordId: number, version: number): Asset[] {
  return getSqlite()
    .prepare(
      "SELECT * FROM record_images WHERE record_id=? AND content_version=? ORDER BY id"
    )
    .all(recordId, version) as Asset[]
}
export const publicUrl = (asset: Asset) => getMedia().publicUrl(asset)

export const revokeVersion = (recordId: number, version: number) =>
  getMedia().revokeVersion(recordId, version)

export const readAsset = (asset: Asset) =>
  getStorage().get(asset.object_key, asset.visibility)

/** Find the most recent usable private source, including a rejected edit. */
export function latestSourceVersion(recordId: number): number | undefined {
  const row = getSqlite()
    .prepare(
      "SELECT MAX(content_version) AS version FROM record_images WHERE record_id=? AND kind='mother' AND status='ready'"
    )
    .get(recordId) as { version: number | null }
  return row.version ?? undefined
}
export async function latestSource(recordId: number): Promise<Buffer> {
  const version = latestSourceVersion(recordId)
  if (version === undefined) throw new Error("找不到原始照片，請重新上傳")
  return source(recordId, version)
}
/** Public visibility remains recorded on failure, so a later call can retry. */
export async function revokeObsoleteVersions(
  recordId: number,
  keepVersion: number
): Promise<void> {
  const versions = getSqlite()
    .prepare(
      "SELECT DISTINCT content_version AS version FROM record_images WHERE record_id=? AND content_version<? AND visibility='public'"
    )
    .all(recordId, keepVersion) as { version: number }[]
  for (const { version } of versions) await revokeVersion(recordId, version)
}

export const purgeRecord = (recordId: number): Promise<void> =>
  getMedia().purgeRecord(recordId)
