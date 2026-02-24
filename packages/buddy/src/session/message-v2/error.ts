import z from "zod"

export const OutputLengthError = z.object({
  name: z.literal("MessageOutputLengthError"),
  message: z.string().optional(),
})

export const AbortedError = z.object({
  name: z.literal("MessageAbortedError"),
  message: z.string(),
})

export const StructuredOutputError = z.object({
  name: z.literal("StructuredOutputError"),
  message: z.string(),
  retries: z.number(),
})

export const AuthError = z.object({
  name: z.literal("ProviderAuthError"),
  providerID: z.string(),
  message: z.string(),
})

export const ContextOverflowError = z.object({
  name: z.literal("ContextOverflowError"),
  message: z.string(),
  responseBody: z.string().optional(),
})

export const APIError = z.object({
  name: z.literal("APIError"),
  message: z.string(),
  statusCode: z.number().optional(),
  isRetryable: z.boolean(),
  responseHeaders: z.record(z.string(), z.string()).optional(),
  responseBody: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

export const UnknownError = z.object({
  name: z.literal("UnknownError"),
  message: z.string(),
})

export const AssistantError = z.discriminatedUnion("name", [
  OutputLengthError,
  AbortedError,
  StructuredOutputError,
  AuthError,
  ContextOverflowError,
  APIError,
  UnknownError,
])

export type APIError = z.infer<typeof APIError>
export type AssistantError = z.infer<typeof AssistantError>

export function toMessageError(error: unknown): AssistantError {
  if (typeof error === "object" && error !== null) {
    const parsed = AssistantError.safeParse(error)
    if (parsed.success) return parsed.data
  }

  const asError = error instanceof Error ? error : undefined
  return {
    name: "UnknownError",
    message: asError?.message ?? String(error),
  }
}
