import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { AppError } from "./security"
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: "欄位格式不正確，請檢查輸入",
        issues: error.issues.map((x) => ({ path: x.path, message: x.message })),
      },
      { status: 400 }
    )
  if (error instanceof AppError)
    return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(
    "request_failed",
    error instanceof Error ? error.name : "UnknownError"
  )
  return NextResponse.json(
    { error: "服務暫時無法完成操作，請稍後重試" },
    { status: 503 }
  )
}
export function checkOrigin(req: NextRequest) {
  const expected = new URL(process.env.APP_URL || req.url).origin
  if (req.headers.get("origin") !== expected)
    throw new AppError("請從本站操作", 403)
}
export function clientAddress(req: NextRequest) {
  // Only trust forwarded addresses when the deployment explicitly guarantees a trusted proxy.
  if (process.env.TRUST_PROXY === "true")
    return (
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    )
  return "shared"
}
export function setSession(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number
) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  })
  return response
}

export async function boundedBody(
  req: NextRequest,
  limit: number
): Promise<Uint8Array> {
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new AppError("請求內容超過大小限制", 413)
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}
export async function readJson(req: NextRequest) {
  const bytes = await boundedBody(req, 16384)
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new AppError("JSON 格式錯誤")
  }
}
export async function readForm(req: NextRequest) {
  const bytes = await boundedBody(req, 11 * 1024 * 1024)
  try {
    return await new Response(bytes as BodyInit, {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData()
  } catch {
    throw new AppError("表單格式錯誤")
  }
}
