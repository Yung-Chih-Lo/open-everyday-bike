import { closeDb } from "../infra/db"
import { cleanupCandidates } from "../modules/records"
import { purgeRecord, revoke, revokeObsoleteVersions } from "../modules/media"

let succeeded = 0
let failed = 0
try {
  for (const record of cleanupCandidates()) {
    try {
      if (record.status === "deleted") await purgeRecord(record.id)
      else if (record.status === "hidden") await revoke(record.id)
      else if (record.status === "published")
        await revokeObsoleteVersions(record.id, record.version)
      else continue
      succeeded++
    } catch {
      // Do not print provider errors: they can contain infrastructure details.
      console.error(`紀錄 No.${record.id} 清理失敗，資料已保留供下次重試`)
      failed++
    }
  }
  console.log(`圖片清理完成：${succeeded} 筆成功，${failed} 筆待重試`)
  if (failed) process.exitCode = 1
} finally {
  closeDb()
}
