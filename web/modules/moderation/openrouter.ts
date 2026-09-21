import { OpenRouter } from "@openrouter/sdk"
import type { ModerationAdapter } from "./types"
import {
  criteria,
  instructions,
  moderationState,
  normalizeResponse,
} from "./policy"

export const openRouterJevAdapter: ModerationAdapter = async (input) => {
  const client = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY?.trim(),
    timeoutMs: 10_000,
    retryConfig: { strategy: "none" },
  })
  const response = await client.alpha.decisions.create({
    decisionsRequest: {
      model: "~typesafe/jev-latest",
      state: moderationState(input),
      questions: { moderation: { type: "choice", instructions, criteria } },
    },
  })
  return normalizeResponse(response)
}
