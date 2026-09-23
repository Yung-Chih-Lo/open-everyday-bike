import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSqlite } from "@/infra/db"
import { AppError } from "@/infra/security"
import {
  errorResponse,
  checkOrigin,
  clientAddress,
  setSession,
  readJson,
  readForm,
} from "@/infra/http"
import * as identity from "@/modules/identity"
import * as records from "@/modules/records"
import * as publishing from "@/modules/publishing"
import * as admin from "@/modules/administration"
import * as moderation from "@/modules/moderation"
import * as settings from "@/modules/settings"
import * as media from "@/modules/media"
import { getBike } from "@/modules/bikes"
import { consumeLimit, verifyTurnstile } from "@/modules/abuse"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const path = (await params).path
    const route = path.join("/"),
      method = req.method
    const raw = req.cookies.get("rider")?.value,
      contributor = identity.authenticate(raw)
    const adminRaw = req.cookies.get("admin")?.value,
      isAdmin = admin.authenticateAdmin(adminRaw)
    const requireUser = () => {
      if (!contributor) throw new AppError("請先建立匿名身分", 401)
      return identity.assertActive(contributor.id)
    }
    const requireAdmin = () => {
      if (!isAdmin) throw new AppError("請先登入管理員", 401)
    }
    const id = () => z.coerce.number().int().positive().parse(path[1])
    if (method !== "GET") checkOrigin(req)
    if (method === "GET") {
      if (route === "config")
        return json({
          turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
        })
      if (route === "health") {
        getSqlite().prepare("SELECT 1").get()
        return json({ ok: true })
      }
      if (route === "records")
        return json({
          records: records
            .listRecords({ q: req.nextUrl.searchParams.get("q") || undefined })
            .map((r) => publishing.decorate(r)),
        })
      if (route === "me")
        return json({
          contributor: contributor
            ? {
                id: contributor.id,
                publicCode: contributor.publicCode,
                nickname: contributor.nickname,
              }
            : null,
          records: contributor
            ? records
                .listRecords({ authorId: contributor.id })
                .map((r) => publishing.decorate(r, true))
            : [],
        })
      if (path[0] === "records" && path.length >= 2) {
        const r = records.getRecord(id())
        const owner = r?.authorId === contributor?.id
        if (
          !r ||
          r.status === "deleted" ||
          (r.status !== "published" && !owner && !isAdmin)
        )
          throw new AppError("找不到紀錄", 404)
        if (path[2] === "download") {
          if (r.status !== "published") throw new AppError("尚未發布", 404)
          const asset = media
            .list(r.id, r.version)
            .find((a) => a.kind === "share" && a.visibility === "public")
          if (!asset) throw new AppError("分享圖尚未完成", 404)
          const body = await media.readAsset(asset)
          return new NextResponse(new Uint8Array(body), {
            headers: {
              "Content-Type": "image/jpeg",
              "Content-Disposition": `attachment; filename=ride-${r.id}.jpg`,
              "Cache-Control": "no-store",
            },
          })
        }
        if (path[2] === "photo") {
          if (!owner && !isAdmin) throw new AppError("無權讀取照片", 403)
          const body = await media.latestSource(r.id)
          return new NextResponse(new Uint8Array(body), {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "private, no-store",
            },
          })
        }
        if (path.length !== 2) throw new AppError("找不到頁面", 404)
        const editing = req.nextUrl.searchParams.get("edit") === "1" && owner
        const decorated = publishing.decorate(
          editing ? records.editable(r.id, contributor!.id) : r,
          owner
        )
        return json({
          record: editing
            ? { ...decorated, imageUrl: `/api/records/${r.id}/photo` }
            : decorated,
        })
      }
      if (path[0] === "bikes" && path.length === 2) {
        const bike = getBike(id())
        if (!bike) throw new AppError("找不到車輛", 404)
        const history = records.bikeHistory(
          bike.id,
          Number(req.nextUrl.searchParams.get("page") || 1)
        )
        return json({
          bike,
          ...history,
          records: history.records.map((r) => publishing.decorate(r)),
        })
      }
      if (route === "admin" || route === "admin/settings") {
        requireAdmin()
        return json({
          records: records
            .listRecords({
              admin: true,
              q: req.nextUrl.searchParams.get("q") || undefined,
            })
            .map((r) => publishing.decorate(r)),
          reports: admin.listReports(),
          settings: {
            ...settings.getSettings(),
            configured: moderation.isModerationConfigured(),
            providers: moderation.getModerationProviders(),
          },
        })
      }
    }
    if (route === "media/preview" && method === "POST") {
      consumeLimit(clientAddress(req), "photo-preview", 12, 60_000)
      const form = await readForm(req)
      const file = form.get("photo")
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > 10 * 1024 * 1024
      )
        throw new AppError("請選擇 10 MB 以內的照片", 413)
      const jpeg = await media.previewPhoto(
        Buffer.from(await file.arrayBuffer())
      )
      return new NextResponse(new Uint8Array(jpeg), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
    if (route === "identity" && method === "POST") {
      consumeLimit(clientAddress(req), "identity", 20)
      if (contributor) return json({ contributor })
      const result = identity.createIdentity()
      return setSession(
        json({
          contributor: result.contributor,
          recoveryCode: result.recoveryCode,
        }),
        "rider",
        result.sessionToken,
        180 * 86400
      )
    }
    if (route === "identity/recover" && method === "POST") {
      consumeLimit(clientAddress(req), "recover", 10)
      const { code } = z
        .object({ code: z.string().min(20).max(200) })
        .parse(await readJson(req))
      const result = identity.recoverIdentity(code)
      return setSession(
        json({
          contributor: result.contributor,
          recoveryCode: result.recoveryCode,
        }),
        "rider",
        result.sessionToken,
        180 * 86400
      )
    }
    if (route === "identity/rotate" && method === "POST") {
      const c = requireUser()
      consumeLimit(c.id, "rotate", 5)
      const result = identity.rotateIdentity(c.id)
      return setSession(
        json({ recoveryCode: result.recoveryCode }),
        "rider",
        result.sessionToken,
        180 * 86400
      )
    }
    if (route === "identity/logout" && method === "POST") {
      if (raw) identity.logout(raw)
      return setSession(json({ ok: true }), "rider", "", 0)
    }
    if (
      (route === "records" && method === "POST") ||
      (path[0] === "records" && path.length === 2 && method === "PUT")
    ) {
      const c = requireUser()
      consumeLimit(clientAddress(req), "upload", 40)
      consumeLimit(c.id, "upload", 20)
      const length = Number(req.headers.get("content-length") || 0)
      if (length > 11 * 1024 * 1024)
        throw new AppError("照片不得超過 10 MB", 413)
      const form = await readForm(req)
      await verifyTurnstile(form.get("turnstileToken"))
      const input = records.rideSchema.parse(
        JSON.parse(String(form.get("data")))
      )
      const requestId = z.string().uuid().parse(form.get("requestId"))
      const file = form.get("photo")
      if (file instanceof File && file.size > 10 * 1024 * 1024)
        throw new AppError("照片不得超過 10 MB", 413)
      if (method === "POST" && (!(file instanceof File) || !file.size))
        throw new AppError("請上傳照片")
      return json(
        await publishing.submit(
          c.id,
          input,
          requestId,
          file instanceof File && file.size
            ? Buffer.from(await file.arrayBuffer())
            : undefined,
          method === "PUT" ? id() : undefined
        )
      )
    }
    if (path[0] === "records" && path.length === 2 && method === "DELETE") {
      const c = requireUser()
      records.owned(id(), c.id)
      await publishing.withdraw(id(), "deleted")
      return json({ ok: true })
    }
    if (route === "reports" && method === "POST") {
      consumeLimit(clientAddress(req), "report", 10)
      const data = z
        .object({
          recordId: z.number().int().positive(),
          reason: z.string().min(1).max(100),
          details: z.string().max(1000).default(""),
          turnstileToken: z.string().optional(),
        })
        .parse(await readJson(req))
      await verifyTurnstile(data.turnstileToken)
      if (records.getRecord(data.recordId)?.status !== "published")
        throw new AppError("找不到紀錄", 404)
      admin.report(data.recordId, data.reason, data.details)
      return json({ ok: true })
    }
    if (route === "admin/login" && method === "POST") {
      consumeLimit(clientAddress(req), "admin-login", 5, 15 * 60000)
      const { password } = z
        .object({ password: z.string().max(256) })
        .parse(await readJson(req))
      return setSession(
        json({ ok: true }),
        "admin",
        admin.loginAdmin(password),
        8 * 3600
      )
    }
    if (route.startsWith("admin/")) {
      requireAdmin()
      if (route === "admin/logout" && method === "POST") {
        if (adminRaw) admin.logoutAdmin(adminRaw)
        return setSession(json({ ok: true }), "admin", "", 0)
      }
      if (route === "admin/settings" && method === "PATCH") {
        const { enabled } = z
          .object({ enabled: z.boolean() })
          .parse(await readJson(req))
        if (enabled && !moderation.isModerationConfigured())
          throw new AppError("尚未設定 TYPESAFE_API_KEY 或 OPENROUTER_API_KEY")
        settings.setModerationEnabled(enabled)
        admin.audit("moderation-setting", "site", String(enabled))
        return json({
          settings: {
            ...settings.getSettings(),
            configured: moderation.isModerationConfigured(),
            providers: moderation.getModerationProviders(),
          },
        })
      }
      if (route === "admin/test" && method === "POST") {
        consumeLimit("admin", "connection-test", 10)
        return json(await moderation.testConnection())
      }
      if (route === "admin/actions" && method === "POST") {
        const d = z
          .object({
            action: z.enum(["hide", "restore", "disable", "enable", "resolve"]),
            recordId: z.number().int().positive().optional(),
            contributorId: z.string().optional(),
            reportId: z.number().int().positive().optional(),
            reason: z.string().min(1).max(500),
          })
          .parse(await readJson(req))
        if (d.action === "hide" || d.action === "restore") {
          if (!d.recordId) throw new AppError("缺少紀錄編號")
          if (d.action === "hide")
            await publishing.withdraw(d.recordId, "hidden")
          else await publishing.restore(d.recordId)
        } else if (d.action === "disable" || d.action === "enable") {
          if (!d.contributorId) throw new AppError("缺少作者")
          identity.setContributorStatus(d.contributorId, d.action === "disable")
        } else {
          if (!d.reportId) throw new AppError("缺少檢舉編號")
          admin.resolveReport(d.reportId)
        }
        admin.audit(
          d.action,
          String(d.recordId || d.contributorId || d.reportId),
          d.reason
        )
        return json({ ok: true })
      }
    }
    throw new AppError("找不到此操作", 404)
  } catch (error) {
    return errorResponse(error)
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
}
