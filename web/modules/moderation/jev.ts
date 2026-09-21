import { choice, TypeSafeClient } from "@typesafe-ai/sdk"
import type { ModerationAdapter } from "./types"
import {
  criteria,
  instructions,
  moderationState,
  normalizeResponse,
} from "./policy"

export const officialJevAdapter: ModerationAdapter = async (input) => {
  const client = new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY?.trim(),
    timeout: 10_000,
    retry: { maxRetries: 0 },
    logLevel: "off",
  })
  const response = await client.systemOne({
    model: process.env.TYPESAFE_MODEL?.trim() || "jev-latest",
    state: moderationState(input),
    questions: { moderation: choice(instructions, criteria) },
  })
  return normalizeResponse(response)
}
