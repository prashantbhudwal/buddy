import z from "zod"
import { AssistantError } from "./error.js"
import { Part } from "./parts.js"

const MessageTime = z.object({
  created: z.number(),
  completed: z.number().optional(),
})

export const OutputFormatText = z.object({
  type: z.literal("text"),
})

export const OutputFormatJsonSchema = z.object({
  type: z.literal("json_schema"),
  schema: z.record(z.string(), z.any()),
  retryCount: z.number().int().min(0).default(2),
})

export const Format = z.discriminatedUnion("type", [OutputFormatText, OutputFormatJsonSchema])

export const User = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("user"),
  agent: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
  variant: z.string().optional(),
  system: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  format: Format.optional(),
  summary: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      diffs: z.array(z.record(z.string(), z.any())),
    })
    .optional(),
  time: z.object({
    created: z.number(),
  }),
})

export const Assistant = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("assistant"),
  parentID: z.string(),
  modelID: z.string(),
  providerID: z.string(),
  mode: z.string(),
  agent: z.string(),
  path: z.object({
    cwd: z.string(),
    root: z.string(),
  }),
  structured: z.any().optional(),
  summary: z.boolean().optional(),
  variant: z.string().optional(),
  time: MessageTime,
  error: AssistantError.optional(),
  cost: z.number(),
  tokens: z.object({
    total: z.number().optional(),
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    cache: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
  finish: z.string().optional(),
})

export const Info = z.discriminatedUnion("role", [User, Assistant])
export const WithParts = z.object({
  info: Info,
  parts: z.array(Part),
})

export type User = z.infer<typeof User>
export type Assistant = z.infer<typeof Assistant>
export type Info = z.infer<typeof Info>
export type WithParts = z.infer<typeof WithParts>
