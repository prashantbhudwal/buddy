import type { Agent } from "../agent/agent.js"
import { Config } from "../config/config.js"

export type ModelIdentity = {
  providerID: string
  modelID: string
}

const KIMI_FALLBACK: ModelIdentity = {
  providerID: "anthropic",
  modelID: "k2p5",
}

function parseModel(model: string): ModelIdentity {
  const index = model.indexOf("/")
  if (index <= 0 || index >= model.length - 1) {
    throw new Error(`Invalid model format: ${model}. Expected provider/model.`)
  }
  return {
    providerID: model.slice(0, index),
    modelID: model.slice(index + 1),
  }
}

function isKimiCompatible(model: ModelIdentity) {
  return model.providerID === "anthropic" && model.modelID.toLowerCase().startsWith("k")
}

export class UnsupportedRuntimeModelError extends Error {
  constructor(model: ModelIdentity) {
    super(
      `Unsupported runtime model: ${model.providerID}/${model.modelID}. Buddy runtime currently supports Kimi-compatible anthropic/k* models only.`,
    )
    this.name = "UnsupportedRuntimeModelError"
  }
}

export async function resolveRuntimeModel(input?: {
  requestModel?: ModelIdentity
  agent?: Agent.Info
}) {
  const config = await Config.get()
  const configured = config.model ? parseModel(config.model) : undefined
  const candidate = input?.requestModel ?? input?.agent?.model ?? configured ?? KIMI_FALLBACK

  if (!isKimiCompatible(candidate)) {
    throw new UnsupportedRuntimeModelError(candidate)
  }

  return candidate
}

export async function resolveSmallRuntimeModel(input?: {
  requestModel?: ModelIdentity
  agent?: Agent.Info
}) {
  const config = await Config.get()
  const configured = config.small_model ? parseModel(config.small_model) : undefined
  const candidate = input?.requestModel ?? input?.agent?.model ?? configured ?? KIMI_FALLBACK

  if (!isKimiCompatible(candidate)) {
    throw new UnsupportedRuntimeModelError(candidate)
  }

  return candidate
}
