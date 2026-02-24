import { Flag } from "../flag/flag.js"
import { Provider } from "../provider/provider.js"
import type { ModelIdentity } from "./model-resolver.js"

const KIMI_REASONING_MODEL_MARKERS = ["k2p5", "kimi-k2.5", "kimi-k2p5"]

export namespace ProviderTransform {
  const OUTPUT_TOKEN_CAP = Flag.BUDDY_EXPERIMENTAL_OUTPUT_TOKEN_MAX
  const OUTPUT_TOKEN_FALLBACK = 32_000

  export async function maxOutputTokens(model?: ModelIdentity) {
    const resolved = await Provider.findModel({
      providerID: model?.providerID,
      modelID: model?.modelID,
    })
    const modelMax = resolved?.limit.output
    if (typeof modelMax === "number" && modelMax > 0) {
      if (typeof OUTPUT_TOKEN_CAP === "number" && OUTPUT_TOKEN_CAP > 0) {
        return Math.min(modelMax, OUTPUT_TOKEN_CAP)
      }
      return modelMax
    }

    if (typeof OUTPUT_TOKEN_CAP === "number" && OUTPUT_TOKEN_CAP > 0) {
      return OUTPUT_TOKEN_CAP
    }
    return OUTPUT_TOKEN_FALLBACK
  }

  export function providerOptions(model: ModelIdentity): Record<string, any> | undefined {
    if (model.providerID !== "anthropic") return undefined

    const modelID = model.modelID.toLowerCase()
    if (!KIMI_REASONING_MODEL_MARKERS.some((marker) => modelID.includes(marker))) {
      return undefined
    }

    const fallback = typeof OUTPUT_TOKEN_CAP === "number" && OUTPUT_TOKEN_CAP > 0 ? OUTPUT_TOKEN_CAP : OUTPUT_TOKEN_FALLBACK

    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: Math.max(1, Math.min(16_000, Math.floor(fallback / 2 - 1))),
        },
      },
    }
  }
}
