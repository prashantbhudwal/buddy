import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Agent } from "../agent/agent.js"
import { Config, JsonError, InvalidError } from "../config/config.js"
import { Provider } from "../provider/provider.js"

const ProviderModel = z.object({
  id: z.string(),
  providerID: z.string(),
  name: z.string(),
  family: z.string().optional(),
  api: z.object({
    id: z.string(),
    npm: z.string().optional(),
  }),
  limit: z.object({
    context: z.number(),
    input: z.number().optional(),
    output: z.number(),
  }),
  modalities: z
    .object({
      input: z.array(z.string()),
      output: z.array(z.string()),
    })
    .optional(),
  reasoning: z.boolean(),
  options: z.record(z.string(), z.any()),
  variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
})

const ProviderInfo = z.object({
  id: z.string(),
  name: z.string(),
  npm: z.string().optional(),
  api: z.string().optional(),
  env: z.array(z.string()),
  models: z.array(ProviderModel),
})

const AgentInfo = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]),
  hidden: z.boolean().optional(),
})

async function providerPayload() {
  const [providers, defaults] = await Promise.all([Provider.list(), Provider.defaults()])
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
        return c.json(await providerPayload())
      },
    )
    .get(
      "/agents",
      describeRoute({
        summary: "List agents",
        description: "List available agents for the current project context.",
        operationId: "config.agents",
        responses: {
          200: {
            description: "Agent list",
            content: {
              "application/json": {
                schema: resolver(z.array(AgentInfo)),
              },
            },
          },
        },
      }),
      async (c) => {
        const agents = await Agent.list()
        return c.json(
          agents.map((agent) => ({
            name: agent.name,
            description: agent.description,
            mode: agent.mode,
            hidden: agent.hidden,
          })),
        )
      },
    )
