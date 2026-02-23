import { convertToModelMessages, type JSONValue, type ModelMessage, type UIMessage } from "ai"
import type { WithParts as MessageWithParts } from "./messages.js"

function toToolModelOutput(output: unknown) {
  if (typeof output === "string") {
    return {
      type: "text" as const,
      value: output,
    }
  }

  if (typeof output === "object" && output !== null) {
    return {
      type: "json" as const,
      value: output as Record<string, unknown>,
    }
  }

  return {
    type: "text" as const,
    value: String(output),
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  if (!isObjectRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function asProviderMetadata(metadata: unknown): Record<string, Record<string, JSONValue>> | undefined {
  if (!isObjectRecord(metadata)) return undefined

  const providerMetadata: Record<string, Record<string, JSONValue>> = {}
  for (const [provider, providerData] of Object.entries(metadata)) {
    if (!isObjectRecord(providerData)) continue

    const cleanedProviderData: Record<string, JSONValue> = {}
    for (const [key, value] of Object.entries(providerData)) {
      if (isJSONValue(value)) {
        cleanedProviderData[key] = value
      }
    }

    if (Object.keys(cleanedProviderData).length > 0) {
      providerMetadata[provider] = cleanedProviderData
    }
  }

  return Object.keys(providerMetadata).length > 0 ? providerMetadata : undefined
}

function asToolInput(input: unknown) {
  if (isObjectRecord(input)) {
    return input
  }
  return {}
}

export function toModelMessages(history: MessageWithParts[]): ModelMessage[] {
  const uiMessages: UIMessage[] = []
  const toolNames = new Set<string>()

  for (const message of history) {
    if (message.parts.length === 0) continue

    if (message.info.role === "user") {
      const userMessage: UIMessage = {
        id: message.info.id,
        role: "user",
        parts: [],
      }

      for (const part of message.parts) {
        if (part.type === "text" && !part.ignored) {
          userMessage.parts.push({
            type: "text",
            text: part.text,
          })
          continue
        }

        if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory") {
          userMessage.parts.push({
            type: "file",
            url: part.url,
            mediaType: part.mime,
            filename: part.filename,
          })
          continue
        }

        if (part.type === "compaction") {
          userMessage.parts.push({
            type: "text",
            text: "What did we do so far?",
          })
          continue
        }

        if (part.type === "subtask") {
          userMessage.parts.push({
            type: "text",
            text: "The following tool was executed by the user",
          })
        }
      }

      if (userMessage.parts.length > 0) {
        uiMessages.push(userMessage)
      }
      continue
    }

    if (message.info.error) {
      const hasUsableOutput = message.parts.some(
        (part: MessageWithParts["parts"][number]) => part.type !== "reasoning" && part.type !== "step-start",
      )
      if (!hasUsableOutput) {
        continue
      }
    }

    const assistantMessage: UIMessage = {
      id: message.info.id,
      role: "assistant",
      parts: [],
    }

    for (const part of message.parts) {
      if (part.type === "text") {
        assistantMessage.parts.push({
          type: "text",
          text: part.text,
          providerMetadata: asProviderMetadata(part.metadata),
        })
        continue
      }

      if (part.type === "reasoning") {
        assistantMessage.parts.push({
          type: "reasoning",
          text: part.text,
          providerMetadata: asProviderMetadata(part.metadata),
        })
        continue
      }

      if (part.type === "step-start") {
        assistantMessage.parts.push({
          type: "step-start",
        })
        continue
      }

      if (part.type !== "tool") continue

      toolNames.add(part.tool)

      if (part.state.status === "completed") {
        const outputText = part.state.time.compacted
          ? "[Old tool result content cleared]"
          : part.state.output
        assistantMessage.parts.push({
          type: (`tool-${part.tool}` as `tool-${string}`),
          state: "output-available",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          output: outputText,
          callProviderMetadata: asProviderMetadata(part.metadata),
        })
        continue
      }

      if (part.state.status === "error") {
        assistantMessage.parts.push({
          type: (`tool-${part.tool}` as `tool-${string}`),
          state: "output-error",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          errorText: part.state.error,
          callProviderMetadata: asProviderMetadata(part.metadata),
        })
        continue
      }

      if (part.state.status === "pending" || part.state.status === "running") {
        assistantMessage.parts.push({
          type: (`tool-${part.tool}` as `tool-${string}`),
          state: "output-error",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          errorText: "[Tool execution was interrupted]",
          callProviderMetadata: asProviderMetadata(part.metadata),
        })
      }
    }

    if (assistantMessage.parts.length > 0) {
      uiMessages.push(assistantMessage)
    }
  }

  const tools = Object.fromEntries(
    Array.from(toolNames).map((toolName) => [
      toolName,
      {
        toModelOutput(result: unknown) {
          return toToolModelOutput(result)
        },
      },
    ]),
  )

  return convertToModelMessages(
    uiMessages.filter((message) => message.parts.some((part) => part.type !== "step-start")),
    {
      // convertToModelMessages only needs tools[name].toModelOutput for this path.
      tools: tools as never,
    },
  )
}
