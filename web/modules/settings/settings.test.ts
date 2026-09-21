import { afterEach, beforeEach, expect, it, vi } from "vitest"
import Database from "better-sqlite3"
const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }))
vi.mock("@/infra/db", () => ({ getSqlite: () => holder.db }))
import { getSettings, setModerationEnabled } from "./index"
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "")
  holder.db = new Database(":memory:")
  holder.db.exec(
    "CREATE TABLE site_settings(id INTEGER PRIMARY KEY,moderation_enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)"
  )
})
afterEach(() => {
  holder.db.close()
  vi.unstubAllEnvs()
})
it("defaults off and saves the switch in SQLite", () => {
  expect(getSettings().moderationEnabled).toBe(false)
  vi.stubEnv("TYPESAFE_API_KEY", "test-key")
  setModerationEnabled(true)
  expect(getSettings().moderationEnabled).toBe(true)
  expect(
    holder.db.prepare("SELECT moderation_enabled FROM site_settings").get()
  ).toEqual({ moderation_enabled: 1 })
  setModerationEnabled(false)
  expect(getSettings().moderationEnabled).toBe(false)
})
it("cannot enable without credentials but can always disable", () => {
  vi.stubEnv("TYPESAFE_API_KEY", " ")
  expect(() => setModerationEnabled(true)).toThrow("TYPESAFE_API_KEY")
  expect(() => setModerationEnabled(false)).not.toThrow()
})

it("can enable with only OpenRouter credentials", () => {
  vi.stubEnv("TYPESAFE_API_KEY", "")
  vi.stubEnv("OPENROUTER_API_KEY", "router-test")
  setModerationEnabled(true)
  expect(getSettings().moderationEnabled).toBe(true)
})
