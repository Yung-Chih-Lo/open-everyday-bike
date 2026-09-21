import { createHmac } from "node:crypto"
import { getSqlite } from "@/infra/db"
import { AppError } from "@/infra/security"
export function consumeLimit(
  subject: string,
  action: string,
  limit: number,
  windowMs = 3600000
) {
  const secret = process.env.RATE_LIMIT_SECRET
  if (!secret && process.env.NODE_ENV === "production")
    throw new AppError("尚未設定限流密鑰", 503)
  const key = createHmac("sha256", secret || "local-development-only")
    .update(subject)
    .digest("hex")
  const now = Date.now(),
    start = Math.floor(now / windowMs) * windowMs
  const sql = getSqlite()
  sql.prepare("DELETE FROM rate_limit_buckets WHERE expires_at<?").run(now)
  const result = sql
    .prepare(
      `INSERT INTO rate_limit_buckets VALUES(?,?,?,1,?) ON CONFLICT(key_hash,action,window_start) DO UPDATE SET count=count+1 WHERE count<?`
    )
    .run(key, action, start, start + windowMs, limit)
  if (!result.changes) throw new AppError("操作過於頻繁，請稍後再試", 429)
}
export async function verifyTurnstile(response: unknown) {
  const key = process.env.TURNSTILE_SECRET_KEY
  if (!key) {
    if (process.env.NODE_ENV === "production")
      throw new AppError("尚未設定驗證服務", 503)
    return
  }
  if (typeof response !== "string" || !response)
    throw new AppError("請先完成人機驗證")
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({ secret: key, response }),
        signal: AbortSignal.timeout(10000),
      }
    )
    const result = (await res.json()) as { success: boolean; hostname?: string }
    if (!res.ok || !result.success) throw new Error()
    const host = new URL(process.env.APP_URL || "http://localhost:3000")
      .hostname
    if (process.env.NODE_ENV === "production" && result.hostname !== host)
      throw new Error()
  } catch {
    throw new AppError("人機驗證失敗，請重試")
  }
}
