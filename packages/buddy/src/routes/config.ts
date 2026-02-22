import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Config, JsonError, InvalidError } from "../config/config.js"

const ProviderModel = z.object({
  id: z.string(),
  name: z.string().optional(),
})

const ProviderInfo = z.object({
  id: z.string(),
  name: z.string(),
  models: z.array(ProviderModel),
})

function parseModel(model: string) {
  const index = model.indexOf("/")
  if (index <= 0 || index >= model.length - 1) return undefined
  return {
    providerID: model.slice(0, index),
    modelID: model.slice(index + 1),
  }
}

function providerPayload(config: Config.Info) {
  const providers: Array<z.infer<typeof ProviderInfo>> = [
    {
      id: "anthropic",
      name: "Kimi (Anthropic API Compatible)",
      models: [
        {
          id: "k2p5",
          name: "Kimi k2p5",
        },
      ],
    },
  ]

  for (const [providerID, providerConfig] of Object.entries(config.provider ?? {})) {
    const models = Object.keys(providerConfig.models ?? {})
      .filter((item) => item.length > 0)
      .map((id) => ({ id }))

    if (models.length === 0) continue

    const exists = providers.find((item) => item.id === providerID)
    if (exists) {
      const merged = new Map(exists.models.map((model) => [model.id, model]))
      for (const model of models) merged.set(model.id, model)
      exists.models = Array.from(merged.values())
      continue
    }

    providers.push({
      id: providerID,
      name: providerID,
      models,
    })
  }

  const defaults: Record<string, string> = {}
  for (const provider of providers) {
    defaults[provider.id] = provider.models[0]?.id ?? ""
  }

  const selected = parseModel(config.model ?? "")
  if (selected?.providerID && selected?.modelID) {
    defaults[selected.providerID] = selected.modelID
  }

  return {
    providers,
    default: defaults,
  }
}

const ErrorResponse = z.object({
  error: z.string(),
})

export const ConfigRoutes = () =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get config",
        description: "Retrieve effective Buddy config for current project context.",
        operationId: "config.get",
        responses: {
          200: {
            description: "Config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.get())
      },
    )
    .patch(
      "/",
      describeRoute({
        summary: "Patch project config",
        description: "Update project-level Buddy config.",
        operationId: "config.update",
        responses: {
          200: {
            description: "Updated config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          400: {
            description: "Invalid config",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        try {
          await Config.update(config)
          return c.json(await Config.get())
        } catch (error) {
          if (error instanceof JsonError || error instanceof InvalidError) {
            return c.json({ error: error.message }, 400)
          }
          throw error
        }
      },
    )
    .get(
      "/providers",
      describeRoute({
        summary: "List providers",
        description: "List configured providers and default model IDs.",
        operationId: "config.providers",
        responses: {
          200: {
            description: "Provider list",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    providers: z.array(ProviderInfo),
                    default: z.record(z.string(), z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const config = await Config.get()
        return c.json(providerPayload(config))
      },
    )
