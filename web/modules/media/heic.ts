import { Worker } from "node:worker_threads"
import path from "node:path"
import { AppError } from "@/infra/security"

export function isHeic(buffer: Buffer) {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(
      buffer.toString("ascii", 8, 12)
    )
  )
}
let converting = false
export async function decodeHeic(buffer: Buffer): Promise<Buffer> {
  if (converting) throw new AppError("照片轉檔忙碌中，請稍後再試", 429)
  converting = true
  let worker: Worker | undefined
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      worker = new Worker(
        path.join(process.cwd(), "modules/media/heic-worker.cjs"),
        { workerData: buffer, resourceLimits: { maxOldGenerationSizeMb: 256 } }
      )
      const timer = setTimeout(
        () => reject(new AppError("HEIC 轉檔逾時，請換一張照片再試", 422)),
        20_000
      )
      worker.once(
        "message",
        (result: { jpeg?: Uint8Array; error?: string }) => {
          clearTimeout(timer)
          if (result.jpeg) resolve(Buffer.from(result.jpeg))
          else
            reject(
              new AppError(
                result.error === "PIXEL_LIMIT"
                  ? "照片不得超過 25 MP"
                  : result.error === "STATIC_ONLY"
                    ? "請上傳單張 HEIC／HEIF 靜態照片"
                    : "無法讀取這張 HEIC／HEIF 照片，請重新匯出後再試",
                422
              )
            )
        }
      )
      worker.once("error", () => {
        clearTimeout(timer)
        reject(new AppError("HEIC 轉檔失敗，請換一張照片再試", 422))
      })
      worker.once("exit", () => {
        clearTimeout(timer)
        reject(new AppError("HEIC 轉檔未完成，請稍後再試", 422))
      })
    })
  } finally {
    await worker?.terminate()
    converting = false
  }
}
