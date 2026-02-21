import { streamText, tool } from "ai"
import { Agent } from "../agent/agent.js"
import { Bus } from "../bus/index.js"
import { PermissionNext } from "../permission/next.js"
import { ToolRegistry } from "../tool/registry.js"
import { loadLearningPrompt, loadMaxStepsPrompt } from "./system-prompt.js"
import { kimiModel } from "./kimi.js"
import { MessageEvents, type ToolPart, toModelMessages } from "./message-v2/index.js"
import { SessionStorage } from "./session-storage.js"
import { SessionStore } from "./session-store.js"
import type { MessageWithParts } from "./message-v2/index.js"

function resolveAgentName(history: MessageWithParts[]) {
  const lastUser = [...history].reverse().find((message) => message.info.role === "user")
  if (!lastUser) return undefined
  return lastUser.info.agent
}

async function resolveTools(input: {
  sessionID: string
  messageID: string
  history: MessageWithParts[]
  abortSignal: AbortSignal
  agent: Agent.Info
}) {
  const resolvedTools = await ToolRegistry.tools({
    model: {
      providerID: "anthropic",
      modelID: "k2p5",
    },
    agent: input.agent,
  })
  const tools: Record<string, any> = {}
  const sessionPermission = SessionStorage.getPermission(input.sessionID)
  const ruleset = PermissionNext.merge(input.agent.permission, sessionPermission)
  const disabled = PermissionNext.disabled(
    resolvedTools.map((item) => item.id),
    ruleset,
  )

  async function updateToolMetadata(inputData: {
    sessionID: string
    messageID: string
    callID?: string
    title?: string
    metadata?: Record<string, unknown>
  }) {
    if (!inputData.callID) return
    const message = SessionStore.getMessageWithParts(inputData.sessionID, inputData.messageID)
    if (!message) return

    const part = [...message.parts]
      .reverse()
      .find((candidate): candidate is ToolPart => candidate.type === "tool" && candidate.callID === inputData.callID)
    if (!part) return

    const next: ToolPart = {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        ...(inputData.metadata ?? {}),
        ...(inputData.title ? { title: inputData.title } : {}),
      },
    }
    SessionStore.updatePart(next)
    await Bus.publish(MessageEvents.PartUpdated, { part: next })
  }

  for (const item of resolvedTools) {
    if (disabled.has(item.id)) continue

    tools[item.id] = tool({
      description: item.description,
      inputSchema: item.parameters as any,
      async execute(args: any, options: any) {
        const toolCallID =
          typeof options?.toolCallId === "string" && options.toolCallId.trim().length > 0
            ? options.toolCallId
            : undefined

        const ctx = {
          sessionID: input.sessionID,
          messageID: input.messageID,
          agent: input.agent.name,
          abort: options?.abortSignal ?? input.abortSignal,
          callID: toolCallID,
          messages: input.history,
          async metadata(metadataInput: { title?: string; metadata?: Record<string, unknown> }) {
            await updateToolMetadata({
              sessionID: input.sessionID,
              messageID: input.messageID,
              callID: toolCallID,
              title: metadataInput.title,
              metadata: metadataInput.metadata,
            })
          },
          async ask(request: {
            permission: string
            patterns: string[]
            always: string[]
            metadata: Record<string, unknown>
          }) {
            await PermissionNext.ask({
              ...request,
              sessionID: input.sessionID,
              tool: toolCallID
                ? {
                    messageID: input.messageID,
                    callID: toolCallID,
                  }
                : undefined,
              ruleset,
            })
          },
        }

        return item.execute(args, ctx as any)
      },
    } as any)
  }

  return tools
}

type StreamAssistantInput = {
  sessionID: string
  messageID: string
  history: MessageWithParts[]
  abortSignal: AbortSignal
  forceTextResponseOnly?: boolean
}

export async function streamAssistant(input: StreamAssistantInput) {
  const agentName = resolveAgentName(input.history)
  const fallbackName = await Agent.defaultAgent()
  const resolvedAgent = (agentName ? await Agent.get(agentName) : undefined) ?? (await Agent.get(fallbackName))
  if (!resolvedAgent) {
    throw new Error("No active agent is configured")
  }

  const systemSections = [await loadLearningPrompt()]
  if (resolvedAgent.prompt) {
    systemSections.push(resolvedAgent.prompt)
  }
  if (input.forceTextResponseOnly) {
    systemSections.push(await loadMaxStepsPrompt())
  }

  const tools = input.forceTextResponseOnly
    ? undefined
    : await resolveTools({
        sessionID: input.sessionID,
        messageID: input.messageID,
        history: input.history,
        abortSignal: input.abortSignal,
        agent: resolvedAgent,
      })

  return streamText({
    async experimental_repairToolCall(failed) {
      const lower = failed.toolCall.toolName.toLowerCase()
      if (lower !== failed.toolCall.toolName && tools?.[lower]) {
        return {
          ...failed.toolCall,
          toolName: lower,
        }
      }

      return {
        ...failed.toolCall,
        input: JSON.stringify({
          tool: failed.toolCall.toolName,
          error: failed.error.message,
        }),
        toolName: "invalid",
      }
    },
    model: kimiModel(),
    system: systemSections.join("\n\n"),
    messages: toModelMessages(input.history),
    temperature: 1.0,
    topP: 0.95,
    maxOutputTokens: 32_000,
    maxRetries: 0,
    activeTools: tools ? Object.keys(tools).filter((toolName) => toolName !== "invalid") : undefined,
    tools,
    toolChoice: input.forceTextResponseOnly ? "none" : "auto",
    abortSignal: input.abortSignal,
  })
}
