import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai"
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

function asToolInput(input: unknown) {
  if (input && typeof input === "object") {
    return input as Record<string, unknown>
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
          providerMetadata: part.metadata,
        })
        continue
      }

      if (part.type === "reasoning") {
        assistantMessage.parts.push({
          type: "reasoning",
          text: part.text,
          providerMetadata: part.metadata,
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
        assistantMessage.parts.push({
          type: (`tool-${part.tool}` as `tool-${string}`),
          state: "output-available",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          output: part.state.output,
          callProviderMetadata: part.metadata,
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
          callProviderMetadata: part.metadata,
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
          callProviderMetadata: part.metadata,
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
