import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createJevAdapter } from "./providers"
import { normalizeResponse } from "./policy"
import type { ModerationInput } from "./types"

const input: ModerationInput = {
  recordId: 1,
  contentVersion: 2,
  bikeNumber: "0120297",
  riddenOn: "2026-09-21",
  city: "台北",
  locationText: "公園",
  scores: {},
  overallGrade: "E",
  impression: "車況不好",
  shortComment: "不推薦",
}
const answer = { choice: "normal" as const, confidence: 0.95, model: "jev" }
beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "official-test")
  vi.stubEnv("OPENROUTER_API_KEY", "router-test")
})
afterEach(() => vi.unstubAllEnvs())
it.each(["normal", "abnormal"] as const)(
  "keeps official %s even at low confidence",
  async (choice) => {
    const official = vi
      .fn()
      .mockResolvedValue({ ...answer, choice, confidence: 0.4 })
    const fallback = vi.fn()
    const reserve = vi.fn()
    expect(await createJevAdapter(reserve, official, fallback)(input)).toEqual({
      ...answer,
      choice,
      confidence: 0.4,
    })
    expect(fallback).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
  }
)
it.each(["TIMEOUT", "INVALID_RESPONSE", "PROVIDER_ERROR"])(
  "falls back after %s and reserves another request",
  async (message) => {
    const official = vi.fn().mockRejectedValue(new Error(message))
    const fallback = vi.fn().mockResolvedValue(answer)
    const reserve = vi.fn(() => true)
    expect(await createJevAdapter(reserve, official, fallback)(input)).toEqual(
      answer
    )
    expect(fallback).toHaveBeenCalledExactlyOnceWith(input)
    expect(reserve).toHaveBeenCalledTimes(1)
  }
)
it("does not bypass quota to call fallback", async () => {
  const fallback = vi.fn()
  await expect(
    createJevAdapter(
      () => false,
      vi.fn().mockRejectedValue(new Error()),
      fallback
    )(input)
  ).rejects.toThrow("DAILY_QUOTA")
  expect(fallback).not.toHaveBeenCalled()
})
it("supports OpenRouter-only configuration without double counting quota", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "")
  const official = vi.fn()
  const reserve = vi.fn()
  expect(
    await createJevAdapter(
      reserve,
      official,
      vi.fn().mockResolvedValue(answer)
    )(input)
  ).toEqual(answer)
  expect(official).not.toHaveBeenCalled()
  expect(reserve).not.toHaveBeenCalled()
})
it("propagates failure when both services fail", async () => {
  await expect(
    createJevAdapter(
      () => true,
      vi.fn().mockRejectedValue(new Error("official")),
      vi.fn().mockRejectedValue(new Error("fallback"))
    )(input)
  ).rejects.toThrow("fallback")
})
it("does not call unconfigured fallback", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "")
  const fallback = vi.fn()
  await expect(
    createJevAdapter(
      () => true,
      vi.fn().mockRejectedValue(new Error("official")),
      fallback
    )(input)
  ).rejects.toThrow("official")
  expect(fallback).not.toHaveBeenCalled()
})
it.each([undefined, NaN, -1, 2])(
  "rejects missing or invalid confidence %s",
  (confidence) => {
    expect(() =>
      normalizeResponse({
        model: "jev",
        answers: {
          moderation: { type: "choice", choice: "normal", confidence },
        },
      })
    ).toThrow("INVALID_RESPONSE")
  }
)
