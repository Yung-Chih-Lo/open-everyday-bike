import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Database from "better-sqlite3"

const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }))
vi.mock("@/infra/db", () => ({ getSqlite: () => holder.db }))
import { checkModeration, MIN_CONFIDENCE } from "./index"
import type { ModerationInput } from "./types"

const input: ModerationInput = {
  recordId: 1,
  contentVersion: 1,
  bikeNumber: "0120297",
  riddenOn: "2026-09-21",
  city: "台北市",
  locationText: "公園",
  scores: { propulsion: 3 },
  overallGrade: "A+",
  impression: "鏈條有點吵，但還是喜歡。",
  shortComment: "有點吵",
}

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "")
  holder.db = new Database(":memory:")
  holder.db
    .exec(`CREATE TABLE moderation_usage(day TEXT PRIMARY KEY,count INTEGER NOT NULL);
    CREATE TABLE moderation_checks(id INTEGER PRIMARY KEY,record_id INTEGER,content_version INTEGER,result TEXT,model TEXT,policy_version TEXT,confidence REAL,error_code TEXT,created_at TEXT);`)
  vi.stubEnv("TYPESAFE_API_KEY", "test-key")
  vi.stubEnv("MODERATION_DAILY_LIMIT", "100")
})
afterEach(() => {
  holder.db.close()
  vi.unstubAllEnvs()
})

describe("moderation publishing seam", () => {
  it("does not invoke provider or need credentials when disabled", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "")
    const adapter = vi.fn()
    expect((await checkModeration(input, false, adapter)).verdict).toBe(
      "skipped"
    )
    expect(adapter).not.toHaveBeenCalled()
  })
  it.each(["normal", "abnormal"] as const)(
    "preserves %s judgments",
    async (choice) => {
      expect(
        (
          await checkModeration(input, true, async () => ({
            choice,
            confidence: 1,
            model: "test",
          }))
        ).verdict
      ).toBe(choice)
    }
  )
  it("blocks low confidence rather than treating it as normal", async () => {
    expect(
      (
        await checkModeration(input, true, async () => ({
          choice: "normal",
          confidence: MIN_CONFIDENCE - 0.01,
          model: "test",
        }))
      ).verdict
    ).toBe("uncertain")
  })
  it("fails closed on missing credentials, malformed response, and timeout", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "")
    expect((await checkModeration(input, true)).errorCode).toBe(
      "NOT_CONFIGURED"
    )
    vi.stubEnv("TYPESAFE_API_KEY", "test-key")
    expect(
      (
        await checkModeration(input, true, async () => ({
          choice: "normal",
          confidence: NaN,
          model: "test",
        }))
      ).errorCode
    ).toBe("INVALID_RESPONSE")
    const error = new Error("sensitive provider details")
    error.name = "APITimeoutError"
    expect(
      (
        await checkModeration(input, true, async () => {
          throw error
        })
      ).errorCode
    ).toBe("TIMEOUT")
  })
  it("reserves quota atomically before calling the provider and never retries above the cap", async () => {
    vi.stubEnv("MODERATION_DAILY_LIMIT", "1")
    const adapter = vi.fn(async () => ({
      choice: "normal" as const,
      confidence: 1,
      model: "test",
    }))
    const results = await Promise.all([
      checkModeration(input, true, adapter),
      checkModeration(input, true, adapter),
    ])
    expect(results.map((r) => r.errorCode)).toContain("DAILY_QUOTA")
    expect(adapter).toHaveBeenCalledTimes(1)
  })
  it("keeps each decision bound to its content version and allows disabled resubmission", async () => {
    await checkModeration(input, true, async () => ({
      choice: "abnormal",
      confidence: 1,
      model: "test",
    }))
    await checkModeration({ ...input, contentVersion: 2 }, false)
    expect(
      holder.db
        .prepare(
          "SELECT content_version, result FROM moderation_checks ORDER BY id"
        )
        .all()
    ).toEqual([
      { content_version: 1, result: "abnormal" },
      { content_version: 2, result: "skipped" },
    ])
  })
})
