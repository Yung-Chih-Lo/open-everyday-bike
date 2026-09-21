import { getSqlite } from "@/infra/db"
import { AppError, token, hash, passwordMatches } from "@/infra/security"
export function authenticateAdmin(raw?: string) {
  return Boolean(
    raw &&
    getSqlite()
      .prepare(
        "SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires_at>?"
      )
      .get(hash(raw), Date.now())
  )
}
export function loginAdmin(password: string) {
  if (!passwordMatches(password, process.env.ADMIN_PASSWORD_HASH || ""))
    throw new AppError("登入資訊無效", 401)
  const raw = token()
  getSqlite()
    .prepare("INSERT INTO admin_sessions VALUES(?,?)")
    .run(hash(raw), Date.now() + 8 * 3600000)
  return raw
}
export function logoutAdmin(raw: string) {
  getSqlite()
    .prepare("DELETE FROM admin_sessions WHERE token_hash=?")
    .run(hash(raw))
}
export function audit(action: string, targetId: string, reason: string) {
  getSqlite()
    .prepare("INSERT INTO admin_actions(action,target_id,reason) VALUES(?,?,?)")
    .run(action, targetId, reason)
}
export function report(recordId: number, reason: string, details: string) {
  getSqlite()
    .prepare("INSERT INTO reports(record_id,reason,details) VALUES(?,?,?)")
    .run(recordId, reason, details)
}
export function listReports() {
  return getSqlite()
    .prepare(
      "SELECT id,record_id AS recordId,reason,details,status,created_at AS createdAt FROM reports ORDER BY id DESC LIMIT 100"
    )
    .all()
}
export function resolveReport(id: number) {
  getSqlite().prepare("UPDATE reports SET status='resolved' WHERE id=?").run(id)
}
