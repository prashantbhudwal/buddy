import z from "zod"
import { Part } from "./parts.js"

const MessageTime = z.object({
  created: z.number(),
  completed: z.number().optional(),
})

export const User = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("user"),
  agent: z.string().optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  system: z.string().optional(),
  time: MessageTime,
})

export const Assistant = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("assistant"),
  agent: z.string(),
  time: MessageTime,
  error: z.string().optional(),
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

