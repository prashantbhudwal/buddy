import z from "zod"

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
  metadata: z.record(z.any()).optional(),
})

export const ReasoningPart = PartBase.extend({
  type: z.literal("reasoning"),
  text: z.string(),
  time: TimeRange,
  metadata: z.record(z.any()).optional(),
})

export const ToolStatePending = z.object({
  status: z.literal("pending"),
  input: z.record(z.any()).optional(),
  raw: z.string().optional(),
})

export const ToolStateRunning = z.object({
  status: z.literal("running"),
  input: z.record(z.any()),
  time: z.object({
    start: z.number(),
  }),
})

export const ToolStateCompleted = z.object({
  status: z.literal("completed"),
  input: z.record(z.any()),
  output: z.string(),
  metadata: z.record(z.any()).optional(),
  title: z.string().optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
    compacted: z.number().optional(),
  }),
})

export const ToolStateError = z.object({
  status: z.literal("error"),
  input: z.record(z.any()).optional(),
  error: z.string(),
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
  metadata: z.record(z.any()).optional(),
})

export const FilePart = PartBase.extend({
  type: z.literal("file"),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
})

export const StepStartPart = PartBase.extend({
  type: z.literal("step-start"),
  snapshot: z.string().optional(),
})

export const StepFinishPart = PartBase.extend({
  type: z.literal("step-finish"),
  reason: z.string().optional(),
  snapshot: z.string().optional(),
  tokens: z
    .object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    })
    .optional(),
  cost: z.number().optional(),
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
})

export const RetryPart = PartBase.extend({
  type: z.literal("retry"),
  attempt: z.number(),
  error: z.string(),
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
