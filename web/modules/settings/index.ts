import { isModerationConfigured } from "@/modules/moderation"
import { getSqlite } from "@/infra/db"

export function getSettings(): { moderationEnabled: boolean } {
  const row = getSqlite()
    .prepare("SELECT moderation_enabled FROM site_settings WHERE id = 1")
    .get() as { moderation_enabled: number } | undefined
  return { moderationEnabled: row?.moderation_enabled === 1 }
}

export function setModerationEnabled(enabled: boolean): void {
  if (enabled && !isModerationConfigured()) {
    throw new Error(
      "尚未設定 TYPESAFE_API_KEY 或 OPENROUTER_API_KEY，無法啟用投稿審核。"
    )
  }
  getSqlite()
    .prepare(
      `INSERT INTO site_settings (id, moderation_enabled, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET moderation_enabled = excluded.moderation_enabled, updated_at = excluded.updated_at`
    )
    .run(enabled ? 1 : 0, new Date().toISOString())
}
