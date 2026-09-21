import { getSqlite } from "@/infra/db"
import { createJevAdapter, isModerationConfigured } from "./providers"
export { isModerationConfigured, getModerationProviders } from "./providers"
import type {
  ModerationAdapter,
  ModerationInput,
  ModerationResult,
} from "./types"
export type {
  ModerationInput,
  ModerationResult,
  ModerationAdapter,
} from "./types"

// Provisional conservative threshold; real Traditional Chinese calibration requires a configured key.
export const POLICY_VERSION = "zh-TW-v1-provisional"
export const MIN_CONFIDENCE = 0.8
export const MODERATION_CONTACT_MESSAGE =
  "這筆紀錄暫時無法發布，如有問題請寄信至 ycl1006.project@gmail.com，並附上紀錄編號。"

function reserveRequest(): boolean {
  const configured = Number(process.env.MODERATION_DAILY_LIMIT ?? 100)
  const limit =
    Number.isSafeInteger(configured) && configured >= 0 ? configured : 100
  if (limit === 0) return false
  return (
    getSqlite()
      .prepare(
        `INSERT INTO moderation_usage (day, count) VALUES (?, 1)
    ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ?`
      )
      .run(new Date().toISOString().slice(0, 10), limit).changes === 1
  )
}

function save(
  input: ModerationInput,
  result: ModerationResult,
  connectionTest: boolean
) {
  getSqlite()
    .prepare(
      `INSERT INTO moderation_checks
    (record_id, content_version, result, model, policy_version, confidence, error_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      connectionTest ? null : input.recordId,
      input.contentVersion,
      result.verdict,
      result.model,
      result.policyVersion,
      result.confidence,
      result.errorCode,
      new Date().toISOString()
    )
  return result
}

export async function checkModeration(
  input: ModerationInput,
  enabled: boolean,
  adapter?: ModerationAdapter,
  connectionTest = false
): Promise<ModerationResult> {
  const base: ModerationResult = {
    verdict: "skipped",
    model: null,
    policyVersion: POLICY_VERSION,
    confidence: null,
    errorCode: null,
  }
  if (!enabled) return save(input, base, connectionTest)
  if (!isModerationConfigured())
    return save(
      input,
      { ...base, verdict: "unavailable", errorCode: "NOT_CONFIGURED" },
      connectionTest
    )
  if (!reserveRequest())
    return save(
      input,
      { ...base, verdict: "unavailable", errorCode: "DAILY_QUOTA" },
      connectionTest
    )
  let result: ModerationResult
  try {
    const answer = await (adapter ?? createJevAdapter(reserveRequest))(input)
    if (
      !["normal", "abnormal"].includes(answer.choice) ||
      !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 ||
      answer.confidence > 1
    )
      throw new Error("INVALID_RESPONSE")
    result = {
      ...base,
      verdict: answer.confidence < MIN_CONFIDENCE ? "uncertain" : answer.choice,
      confidence: answer.confidence,
      model: answer.model,
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : ""
    const code =
      error instanceof Error &&
      ["INVALID_RESPONSE", "DAILY_QUOTA", "NOT_CONFIGURED"].includes(
        error.message
      )
        ? error.message
        : name === "APITimeoutError" ||
            name === "AbortError" ||
            name === "TimeoutError" ||
            name === "RequestTimeoutError"
          ? "TIMEOUT"
          : "PROVIDER_ERROR"
    result = { ...base, verdict: "unavailable", errorCode: code }
  }
  return save(input, result, connectionTest)
}

export async function testConnection(): Promise<ModerationResult> {
  return checkModeration(
    {
      recordId: 0,
      contentVersion: 0,
      bikeNumber: "0120297",
      riddenOn: "2026-01-01",
      city: "台北市",
      locationText: "公園旁",
      scores: {
        propulsion: 4,
        cleanliness: 4,
        handling: 4,
        condition: 4,
        sensor: 4,
        agility: 4,
      },
      overallGrade: "A",
      impression: "踩踏順暢，煞車正常，車籃乾淨。",
      shortComment: "舒適的一趟騎乘",
    },
    true,
    undefined,
    true
  )
}
