import { officialJevAdapter } from "./jev"
import { openRouterJevAdapter } from "./openrouter"
import type { ModerationAdapter } from "./types"

export function getModerationProviders() {
  return {
    official: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
  }
}
export function isModerationConfigured() {
  const providers = getModerationProviders()
  return providers.official || providers.openrouter
}

// The caller reserves the first request; fallback must reserve another real call.
export function createJevAdapter(
  reserveFallback: () => boolean,
  official: ModerationAdapter = officialJevAdapter,
  openrouter: ModerationAdapter = openRouterJevAdapter
): ModerationAdapter {
  return async (input) => {
    const configured = getModerationProviders()
    if (configured.official) {
      try {
        return await official(input)
      } catch (error) {
        if (!configured.openrouter) throw error
        if (!reserveFallback()) throw new Error("DAILY_QUOTA")
      }
    } else if (!configured.openrouter) {
      throw new Error("NOT_CONFIGURED")
    }
    return openrouter(input)
  }
}
