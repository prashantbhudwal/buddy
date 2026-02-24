import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Global } from "../storage/global.js"

const DEFAULT_MODELS_URL = "https://models.dev"
const CACHE_FILE = "models.json"
const REFRESH_INTERVAL_MS = 60 * 60 * 1000

const ModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  family: z.string().optional(),
  release_date: z.string().optional(),
  attachment: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  temperature: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  interleaved: z
    .union([
      z.literal(true),
      z
        .object({
          field: z.enum(["reasoning_content", "reasoning_details"]),
        })
        .strict(),
    ])
    .optional(),
  cost: z
    .object({
      input: z.number(),
      output: z.number(),
      cache_read: z.number().optional(),
      cache_write: z.number().optional(),
      context_over_200k: z
        .object({
          input: z.number(),
          output: z.number(),
          cache_read: z.number().optional(),
          cache_write: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  limit: z.object({
    context: z.number(),
    input: z.number().optional(),
    output: z.number(),
  }),
  modalities: z
    .object({
      input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
    })
    .optional(),
  experimental: z.boolean().optional(),
  status: z.enum(["alpha", "beta", "deprecated"]).optional(),
  options: z.record(z.string(), z.any()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
  variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
})

const ProviderSchema = z.object({
  api: z.string().optional(),
  name: z.string(),
  env: z.array(z.string()).default([]),
  id: z.string(),
  npm: z.string().optional(),
  models: z.record(z.string(), ModelSchema),
})

type ProvidersPayload = Record<string, z.infer<typeof ProviderSchema>>

function cachePath() {
  return process.env.BUDDY_MODELS_PATH ?? path.join(Global.Path.cache, CACHE_FILE)
}

function modelsUrl() {
  return process.env.BUDDY_MODELS_URL ?? DEFAULT_MODELS_URL
}

function canFetch() {
  return process.env.BUDDY_DISABLE_MODELS_FETCH !== "1"
}

let dataCache: ProvidersPayload | undefined
let dataPromise: Promise<ProvidersPayload> | undefined

async function readCachedPayload() {
  const raw = await fs.readFile(cachePath(), "utf8").catch(() => undefined)
  if (!raw) return undefined
  const parsed = JSON.parse(raw) as unknown
  return z.record(z.string(), ProviderSchema).parse(parsed)
}

async function fetchPayload() {
  const response = await fetch(`${modelsUrl()}/api.json`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`models.dev request failed (${response.status})`)
  }
  const text = await response.text()
  const payload = z.record(z.string(), ProviderSchema).parse(JSON.parse(text))
  await fs.writeFile(cachePath(), text, "utf8").catch(() => undefined)
  return payload
}

async function loadPayload(): Promise<ProvidersPayload> {
  if (dataCache) return dataCache
  if (dataPromise) return dataPromise

  dataPromise = (async () => {
    const cached = await readCachedPayload().catch(() => undefined)
    if (cached) {
      dataCache = cached
      return cached
    }

    if (!canFetch()) {
      dataCache = {}
      return dataCache
    }

    const fetched = await fetchPayload().catch(() => undefined)
    dataCache = fetched ?? {}
    return dataCache
  })()

  try {
    return await dataPromise
  } finally {
    dataPromise = undefined
  }
}

export namespace ModelsDev {
  export const Model = ModelSchema
  export const Provider = ProviderSchema
  export type Model = z.infer<typeof ModelSchema>
  export type Provider = z.infer<typeof ProviderSchema>

  export async function get() {
    return loadPayload()
  }

  export async function refresh() {
    if (!canFetch()) return
    const fetched = await fetchPayload().catch(() => undefined)
    if (!fetched) return
    dataCache = fetched
  }
}

if (canFetch()) {
  void ModelsDev.refresh()
  setInterval(() => {
    void ModelsDev.refresh()
  }, REFRESH_INTERVAL_MS).unref()
}
