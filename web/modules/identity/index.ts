import { randomUUID } from "node:crypto"
import { getSqlite } from "@/infra/db"
import { token, hash, AppError } from "@/infra/security"
export type Contributor = {
  id: string
  publicCode: string
  nickname: string
  status: string
}
export function getContributor(id: string) {
  return getSqlite()
    .prepare(
      "SELECT id,public_code AS publicCode,nickname,status FROM contributors WHERE id=?"
    )
    .get(id) as Contributor | undefined
}
export function authenticate(raw?: string) {
  if (!raw) return undefined
  const row = getSqlite()
    .prepare(
      "SELECT contributor_id FROM sessions WHERE token_hash=? AND expires_at>?"
    )
    .get(hash(raw), Date.now()) as { contributor_id: string } | undefined
  return row ? getContributor(row.contributor_id) : undefined
}
export function assertActive(id: string) {
  const c = getContributor(id)
  if (!c || c.status !== "active")
    throw new AppError("此身分已停用，請聯絡本站信箱", 403)
  return c
}
function session(id: string) {
  const raw = token()
  getSqlite()
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(hash(raw), id, Date.now() + 180 * 86400000)
  return raw
}
export function createIdentity() {
  return getSqlite().transaction(() => {
    const id = randomUUID(),
      code = token()
    getSqlite()
      .prepare(
        "INSERT INTO contributors(id,public_code,recovery_hash) VALUES(?,?,?)"
      )
      .run(id, token().slice(0, 10), hash(code))
    return {
      contributor: getContributor(id)!,
      recoveryCode: code,
      sessionToken: session(id),
    }
  })()
}
export function recoverIdentity(code: string) {
  return getSqlite().transaction(() => {
    const c = getSqlite()
      .prepare("SELECT id FROM contributors WHERE recovery_hash=?")
      .get(hash(code)) as { id: string } | undefined
    if (!c) throw new AppError("復原碼無效", 401)
    assertActive(c.id)
    return rotateIdentity(c.id)
  })()
}
export function rotateIdentity(id: string) {
  return getSqlite().transaction(() => {
    assertActive(id)
    const code = token()
    getSqlite()
      .prepare("UPDATE contributors SET recovery_hash=? WHERE id=?")
      .run(hash(code), id)
    getSqlite().prepare("DELETE FROM sessions WHERE contributor_id=?").run(id)
    return {
      contributor: getContributor(id)!,
      recoveryCode: code,
      sessionToken: session(id),
    }
  })()
}
export function logout(raw: string) {
  getSqlite().prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(raw))
}
export function setContributorStatus(id: string, disabled: boolean) {
  getSqlite()
    .prepare("UPDATE contributors SET status=? WHERE id=?")
    .run(disabled ? "disabled" : "active", id)
}
