import { Flag } from "../flag/flag.js"
import type { ModelIdentity } from "./model-resolver.js"

const KIMI_REASONING_MODEL_MARKERS = ["k2p5", "kimi-k2.5", "kimi-k2p5"]

export namespace ProviderTransform {
  export const OUTPUT_TOKEN_MAX = Flag.BUDDY_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  export function maxOutputTokens(_model?: ModelIdentity) {
    return OUTPUT_TOKEN_MAX
  }

  export function providerOptions(model: ModelIdentity): Record<string, any> | undefined {
    if (model.providerID !== "anthropic") return undefined

    const modelID = model.modelID.toLowerCase()
    if (!KIMI_REASONING_MODEL_MARKERS.some((marker) => modelID.includes(marker))) {
      return undefined
    }

    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: Math.max(1, Math.min(16_000, Math.floor(maxOutputTokens(model) / 2 - 1))),
        },
      },
    }
  }
}
