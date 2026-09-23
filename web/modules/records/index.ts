import { getSqlite } from "@/infra/db"
import { AppError } from "@/infra/security"
import type { RideInput, RecordView, RecordStatus } from "./types"
export { rideSchema, scoreLabels } from "./types"
export type { RideInput, RecordView, RecordStatus } from "./types"
type Row = {
  id: number
  bike_id: number
  author_id: string
  status: RecordStatus
  version: number
  content: string
  updated_at: string
}
function view(row: Row): RecordView {
  return {
    id: row.id,
    bikeId: row.bike_id,
    authorId: row.author_id,
    authorCode: "",
    status: row.status,
    version: row.version,
    content: JSON.parse(row.content),
    updatedAt: row.updated_at,
  }
}
export function getRecord(id: number) {
  const r = getSqlite()
    .prepare("SELECT * FROM ride_records WHERE id=?")
    .get(id) as Row | undefined
  return r ? view(r) : undefined
}
export function listRecords(
  options: {
    authorId?: string
    bikeId?: number
    q?: string
    admin?: boolean
  } = {}
) {
  const clauses: string[] = [],
    args: (string | number)[] = []
  if (options.authorId) {
    clauses.push("author_id=? AND status!='deleted'")
    args.push(options.authorId)
  } else if (!options.admin) clauses.push("status='published'")
  if (options.bikeId) {
    clauses.push("bike_id=?")
    args.push(options.bikeId)
  }
  if (options.q) {
    clauses.push("json_extract(content,'$.bikeNumber')=?")
    args.push(options.q)
  }
  return (
    getSqlite()
      .prepare(
        `SELECT * FROM ride_records ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY json_extract(content,'$.riddenOn') DESC,id DESC LIMIT 100`
      )
      .all(...args) as Row[]
  ).map(view)
}
export function bikeHistory(bikeId: number, requestedPage = 1) {
  const pageSize = 12
  const summary = getSqlite()
    .prepare(
      "SELECT COUNT(*) AS total, MAX(json_extract(content,'$.riddenOn')) AS latestRiddenOn FROM ride_records WHERE bike_id=? AND status='published'"
    )
    .get(bikeId) as { total: number; latestRiddenOn: string | null }
  const pages = Math.max(1, Math.ceil(summary.total / pageSize))
  const page = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1)
  )
  const rows = getSqlite()
    .prepare(
      "SELECT * FROM ride_records WHERE bike_id=? AND status='published' ORDER BY json_extract(content,'$.riddenOn') DESC,id DESC LIMIT ? OFFSET ?"
    )
    .all(bikeId, pageSize, (page - 1) * pageSize) as Row[]
  return { ...summary, page, pages, pageSize, records: rows.map(view) }
}
export function owned(id: number, authorId: string) {
  const r = getRecord(id)
  if (!r || r.authorId !== authorId || r.status === "deleted")
    throw new AppError("找不到紀錄", 404)
  return r
}
export type Attempt = {
  request_id: string
  author_id: string
  record_id: number
  version: number
  state: string
  message: string | null
  created_at: number
}
export function beginAttempt(
  authorId: string,
  bikeId: number,
  input: RideInput,
  requestId: string,
  id?: number
) {
  const sql = getSqlite()
  return sql.transaction(() => {
    const prior = sql
      .prepare("SELECT * FROM publish_attempts WHERE request_id=?")
      .get(requestId) as Attempt | undefined
    if (prior) {
      if (prior.author_id !== authorId)
        throw new AppError("重複提交識別碼無效", 409)
      return prior
    }
    if (id) {
      const r = owned(id, authorId)
      if (r.status === "hidden") throw new AppError("已隱藏紀錄無法修改", 403)
    } else {
      id = Number(
        sql
          .prepare(
            "INSERT INTO ride_records(bike_id,author_id,content) VALUES(?,?,?)"
          )
          .run(bikeId, authorId, JSON.stringify(input)).lastInsertRowid
      )
    }
    if (
      sql
        .prepare(
          "SELECT 1 FROM publish_attempts WHERE record_id=? AND state='working'"
        )
        .get(id)
    )
      throw new AppError("紀錄正在處理，請稍候", 409)
    const row = sql
      .prepare(
        "UPDATE ride_records SET next_version=next_version+1 WHERE id=? RETURNING next_version"
      )
      .get(id) as { next_version: number }
    sql
      .prepare("INSERT INTO record_versions VALUES(?,?,?)")
      .run(id, row.next_version, JSON.stringify(input))
    sql
      .prepare(
        "INSERT INTO publish_attempts(request_id,author_id,record_id,version,created_at) VALUES(?,?,?,?,?)"
      )
      .run(requestId, authorId, id, row.next_version, Date.now())
    return sql
      .prepare("SELECT * FROM publish_attempts WHERE request_id=?")
      .get(requestId) as Attempt
  })()
}
export function completeAttempt(requestId: string, bikeId: number) {
  const sql = getSqlite()
  return sql.transaction(() => {
    const a = sql
      .prepare(
        "SELECT * FROM publish_attempts WHERE request_id=? AND state='working'"
      )
      .get(requestId) as Attempt | undefined
    if (!a) throw new AppError("發布作業已失效", 409)
    const r = getRecord(a.record_id)
    if (!r || r.status === "hidden" || r.status === "deleted")
      throw new AppError("紀錄已被撤下", 409)
    const v = sql
      .prepare(
        "SELECT content FROM record_versions WHERE record_id=? AND version=?"
      )
      .get(a.record_id, a.version) as { content: string }
    sql
      .prepare(
        "UPDATE ride_records SET content=?,version=?,bike_id=?,status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?"
      )
      .run(v.content, a.version, bikeId, a.record_id)
    sql
      .prepare(
        "UPDATE publish_attempts SET state='published' WHERE request_id=?"
      )
      .run(requestId)
  })()
}
export function failAttempt(requestId: string, message: string) {
  const sql = getSqlite()
  sql.transaction(() => {
    const a = sql
      .prepare("SELECT * FROM publish_attempts WHERE request_id=?")
      .get(requestId) as Attempt
    sql
      .prepare(
        "UPDATE publish_attempts SET state='failed',message=? WHERE request_id=? AND state='working'"
      )
      .run(message, requestId)
    // Keep submitted draft text available without replacing a previously published version.
    sql
      .prepare(
        "UPDATE ride_records SET content=(SELECT content FROM record_versions WHERE record_id=? AND version=?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'"
      )
      .run(a.record_id, a.version, a.record_id)
  })()
}
export function setRecordStatus(id: number, status: RecordStatus) {
  getSqlite()
    .prepare(
      "UPDATE ride_records SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    )
    .run(status, id)
}
export function withdrawRecord(id: number, status: "hidden" | "deleted") {
  const sql = getSqlite()
  sql.transaction(() => {
    const current = getRecord(id)
    if (!current) throw new AppError("找不到紀錄", 404)
    if (current.status === "deleted" && status !== "deleted")
      throw new AppError("已刪除紀錄無法恢復", 409)
    // next_version is also the mutation generation. Gaps are intentional.
    sql
      .prepare(
        "UPDATE ride_records SET status=?,next_version=next_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?"
      )
      .run(status, id)
    sql
      .prepare(
        "UPDATE publish_attempts SET state='failed',message='紀錄已撤下' WHERE record_id=? AND state='working'"
      )
      .run(id)
  })()
}
export function restorationSnapshot(id: number) {
  const record = getRecord(id)
  if (!record || record.status !== "hidden" || !record.version)
    throw new AppError("此紀錄無法恢復")
  const { next_version: revision } = getSqlite()
    .prepare("SELECT next_version FROM ride_records WHERE id=?")
    .get(id) as { next_version: number }
  return { record, revision }
}
export function completeRestore(id: number, revision: number) {
  const result = getSqlite()
    .prepare(
      "UPDATE ride_records SET status='published',next_version=next_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='hidden' AND next_version=?"
    )
    .run(id, revision)
  if (result.changes !== 1)
    throw new AppError("紀錄狀態已變更，恢復作業已取消", 409)
}
export function latestSourceVersion(id: number) {
  return (
    (
      getSqlite()
        .prepare(
          "SELECT MAX(version) AS v FROM record_versions WHERE record_id=?"
        )
        .get(id) as { v: number | null }
    ).v ?? 0
  )
}
export function recoverStaleAttempts() {
  getSqlite()
    .prepare(
      "UPDATE publish_attempts SET state='failed',message='處理中斷，請重新提交' WHERE state='working' AND created_at<?"
    )
    .run(Date.now() - 15 * 60000)
}
export function editable(id: number, authorId: string) {
  const r = owned(id, authorId)
  const latest = getSqlite()
    .prepare(
      "SELECT content FROM record_versions WHERE record_id=? ORDER BY version DESC LIMIT 1"
    )
    .get(id) as { content: string } | undefined
  return latest ? { ...r, content: JSON.parse(latest.content) } : r
}

/** Maintenance reads lifecycle facts through the records public seam. */
export function cleanupCandidates(): {
  id: number
  status: RecordStatus
  version: number
}[] {
  return getSqlite()
    .prepare(
      "SELECT id,status,version FROM ride_records WHERE status IN ('published','hidden','deleted')"
    )
    .all() as { id: number; status: RecordStatus; version: number }[]
}
