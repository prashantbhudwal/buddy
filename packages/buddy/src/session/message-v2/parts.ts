import z from "zod"
import { APIError } from "./error.js"

const PartBase = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
})

const TimeRange = z.object({
  start: z.number(),
  end: z.number().optional(),
})

export const TextPart = PartBase.extend({
  type: z.literal("text"),
  text: z.string(),
  synthetic: z.boolean().optional(),
  ignored: z.boolean().optional(),
  time: TimeRange.optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const ReasoningPart = PartBase.extend({
  type: z.literal("reasoning"),
  text: z.string(),
  time: TimeRange,
  metadata: z.record(z.string(), z.any()).optional(),
})

const FilePartSourceBase = z.object({
  text: z.object({
    value: z.string(),
    start: z.number().int(),
    end: z.number().int(),
  }),
})

export const FileSource = FilePartSourceBase.extend({
  type: z.literal("file"),
  path: z.string(),
})

export const SymbolSource = FilePartSourceBase.extend({
  type: z.literal("symbol"),
  path: z.string(),
  range: z.record(z.string(), z.any()),
  name: z.string(),
  kind: z.number().int(),
})

export const ResourceSource = FilePartSourceBase.extend({
  type: z.literal("resource"),
  clientName: z.string(),
  uri: z.string(),
})

export const FilePartSource = z.discriminatedUnion("type", [FileSource, SymbolSource, ResourceSource])

export const FilePart = PartBase.extend({
  type: z.literal("file"),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  source: FilePartSource.optional(),
})

export const ToolStatePending = z.object({
  status: z.literal("pending"),
  input: z.record(z.string(), z.any()),
  raw: z.string(),
})

export const ToolStateRunning = z.object({
  status: z.literal("running"),
  input: z.record(z.string(), z.any()),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  time: z.object({
    start: z.number(),
  }),
})

export const ToolStateCompleted = z.object({
  status: z.literal("completed"),
  input: z.record(z.string(), z.any()),
  output: z.string(),
  metadata: z.record(z.string(), z.any()),
  title: z.string(),
  time: z.object({
    start: z.number(),
    end: z.number(),
    compacted: z.number().optional(),
  }),
  attachments: z
    .array(
      z.object({
        mime: z.string(),
        filename: z.string().optional(),
        url: z.string(),
        source: FilePartSource.optional(),
      }),
    )
    .optional(),
})

export const ToolStateError = z.object({
  status: z.literal("error"),
  input: z.record(z.string(), z.any()),
  error: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
})

export const ToolState = z.discriminatedUnion("status", [
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
])

export const ToolPart = PartBase.extend({
  type: z.literal("tool"),
  tool: z.string(),
  callID: z.string(),
  state: ToolState,
  metadata: z.record(z.string(), z.any()).optional(),
})

export const StepStartPart = PartBase.extend({
  type: z.literal("step-start"),
  snapshot: z.string().optional(),
})

export const StepFinishPart = PartBase.extend({
  type: z.literal("step-finish"),
  reason: z.string(),
  snapshot: z.string().optional(),
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
  cost: z.number(),
})

export const PatchPart = PartBase.extend({
  type: z.literal("patch"),
  hash: z.string(),
  files: z.array(z.string()),
})

export const SnapshotPart = PartBase.extend({
  type: z.literal("snapshot"),
  snapshot: z.string(),
})

export const CompactionPart = PartBase.extend({
  type: z.literal("compaction"),
  auto: z.boolean(),
})

export const SubtaskPart = PartBase.extend({
  type: z.literal("subtask"),
  prompt: z.string(),
  description: z.string(),
  agent: z.string(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  command: z.string().optional(),
})

export const AgentPart = PartBase.extend({
  type: z.literal("agent"),
  name: z.string(),
  source: z
    .object({
      value: z.string(),
      start: z.number().int(),
      end: z.number().int(),
    })
    .optional(),
})

export const RetryPart = PartBase.extend({
  type: z.literal("retry"),
  attempt: z.number(),
  error: APIError,
  time: z.object({
    created: z.number(),
  }),
})

export const Part = z.discriminatedUnion("type", [
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  PatchPart,
  SnapshotPart,
  CompactionPart,
  SubtaskPart,
  AgentPart,
  RetryPart,
])

export type Part = z.infer<typeof Part>
export type TextPart = z.infer<typeof TextPart>
export type ReasoningPart = z.infer<typeof ReasoningPart>
export type ToolPart = z.infer<typeof ToolPart>
export type ToolState = z.infer<typeof ToolState>
export type ToolStatePending = z.infer<typeof ToolStatePending>
export type ToolStateRunning = z.infer<typeof ToolStateRunning>
export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>
export type ToolStateError = z.infer<typeof ToolStateError>
export type StepFinishPart = z.infer<typeof StepFinishPart>
