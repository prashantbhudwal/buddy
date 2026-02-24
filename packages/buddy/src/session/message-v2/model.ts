import { convertToModelMessages, type JSONValue, type ModelMessage, type UIMessage } from "ai"
import type { WithParts as MessageWithParts } from "./messages.js"

type ActiveModel = {
  providerID: string
  modelID: string
  apiNpm?: string
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
  const result: Record<string, Record<string, JSONValue>> = {}

  for (const [provider, value] of Object.entries(metadata)) {
    if (!isObjectRecord(value)) continue
    const cleaned: Record<string, JSONValue> = {}
    for (const [key, item] of Object.entries(value)) {
      if (isJSONValue(item)) cleaned[key] = item
    }
    if (Object.keys(cleaned).length > 0) {
      result[provider] = cleaned
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function asToolInput(input: unknown) {
  if (isObjectRecord(input)) return input
  return {}
}

function toToolModelOutput(output: unknown) {
  if (typeof output === "string") {
    return { type: "text" as const, value: output }
  }

  if (isObjectRecord(output)) {
    const text = typeof output.text === "string" ? output.text : JSON.stringify(output, null, 2)
    const attachments = Array.isArray(output.attachments)
      ? output.attachments.filter(
          (item): item is { mime: string; url: string } =>
            isObjectRecord(item) && typeof item.mime === "string" && typeof item.url === "string",
        )
      : []

    if (attachments.length === 0) {
      return { type: "text" as const, value: text }
    }

    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text },
        ...attachments
          .filter((item) => item.url.startsWith("data:") && item.url.includes(","))
          .map((item) => ({
            type: "media" as const,
            mediaType: item.mime,
            data: item.url.slice(item.url.indexOf(",") + 1),
          })),
      ],
    }
  }

  return { type: "text" as const, value: String(output) }
}

function supportsMediaInToolResults(model?: ActiveModel) {
  const npm = model?.apiNpm
  if (!npm) return false
  return npm === "@ai-sdk/anthropic" || npm === "@ai-sdk/openai" || npm === "@ai-sdk/amazon-bedrock"
}

export function toModelMessages(history: MessageWithParts[], model?: ActiveModel): ModelMessage[] {
  const uiMessages: UIMessage[] = []
  const toolNames = new Set<string>()
  const includeMediaInToolResults = supportsMediaInToolResults(model)

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
      const hasUsableOutput = message.parts.some((part) => part.type !== "reasoning" && part.type !== "step-start")
      if (!hasUsableOutput) continue
    }

    const differentModel = model
      ? `${model.providerID}/${model.modelID}` !== `${message.info.providerID}/${message.info.modelID}`
      : false
    const pendingMedia: Array<{ mime: string; url: string }> = []
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
          ...(differentModel ? {} : { providerMetadata: asProviderMetadata(part.metadata) }),
        })
        continue
      }

      if (part.type === "reasoning") {
        assistantMessage.parts.push({
          type: "reasoning",
          text: part.text,
          ...(differentModel ? {} : { providerMetadata: asProviderMetadata(part.metadata) }),
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
        const outputText = part.state.time.compacted ? "[Old tool result content cleared]" : part.state.output
        const allAttachments = part.state.time.compacted ? [] : (part.state.attachments ?? [])
        const mediaAttachments = allAttachments.filter(
          (item) => item.mime.startsWith("image/") || item.mime === "application/pdf",
        )
        const attachments = includeMediaInToolResults
          ? allAttachments
          : allAttachments.filter((item) => !mediaAttachments.includes(item))

        if (!includeMediaInToolResults && mediaAttachments.length > 0) {
          pendingMedia.push(...mediaAttachments.map((item) => ({ mime: item.mime, url: item.url })))
        }

        const output =
          attachments.length > 0
            ? {
                text: outputText,
                attachments: attachments.map((item) => ({ mime: item.mime, url: item.url })),
              }
            : outputText

        assistantMessage.parts.push({
          type: `tool-${part.tool}` as `tool-${string}`,
          state: "output-available",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          output,
          ...(differentModel ? {} : { callProviderMetadata: asProviderMetadata(part.metadata) }),
        })
        continue
      }

      if (part.state.status === "error") {
        assistantMessage.parts.push({
          type: `tool-${part.tool}` as `tool-${string}`,
          state: "output-error",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          errorText: part.state.error,
          ...(differentModel ? {} : { callProviderMetadata: asProviderMetadata(part.metadata) }),
        })
        continue
      }

      if (part.state.status === "pending" || part.state.status === "running") {
        assistantMessage.parts.push({
          type: `tool-${part.tool}` as `tool-${string}`,
          state: "output-error",
          toolCallId: part.callID,
          input: asToolInput(part.state.input),
          errorText: "[Tool execution was interrupted]",
          ...(differentModel ? {} : { callProviderMetadata: asProviderMetadata(part.metadata) }),
        })
      }
    }

    if (assistantMessage.parts.length > 0) {
      uiMessages.push(assistantMessage)
      if (pendingMedia.length > 0) {
        uiMessages.push({
          id: `${message.info.id}:media`,
          role: "user",
          parts: [
            {
              type: "text",
              text: "Attached image(s) from tool result:",
            },
            ...pendingMedia.map((item) => ({
              type: "file" as const,
              url: item.url,
              mediaType: item.mime,
            })),
          ],
        })
      }
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
