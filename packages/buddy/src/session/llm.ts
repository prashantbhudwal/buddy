import { streamText, tool, type ModelMessage } from 'ai'
import { Agent } from '../agent/agent.js'
import { Bus } from '../bus/index.js'
import { PermissionNext } from '../permission/next.js'
import { ToolRegistry } from '../tool/registry.js'
import {
  loadEnvironment,
  loadBehavior,
  loadCurriculumContext,
  loadMaxStepsPrompt,
} from './system-prompt.js'
import { loadInstructions } from './instruction.js'
import { kimiModel } from './kimi.js'
import {
  MessageEvents,
  type ToolPart,
  toModelMessages,
} from './message-v2/index.js'
import { SessionStorage } from './session-storage.js'
import { SessionStore } from './session-store.js'
import type { MessageWithParts } from './message-v2/index.js'

const DOOM_LOOP_THRESHOLD = 3

function resolveAgentName(history: MessageWithParts[]) {
  const lastUser = [...history]
    .reverse()
    .find((message) => message.info.role === 'user')
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
      providerID: 'anthropic',
      modelID: 'k2p5',
    },
    agent: input.agent,
  })
  const tools: Record<string, any> = {}
  const sessionPermission = SessionStorage.getPermission(input.sessionID)
  const ruleset = PermissionNext.merge(
    input.agent.permission,
    sessionPermission,
  )
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
    const message = SessionStore.getMessageWithParts(
      inputData.sessionID,
      inputData.messageID,
    )
    if (!message) return

    const part = [...message.parts]
      .reverse()
      .find(
        (candidate): candidate is ToolPart =>
          candidate.type === 'tool' && candidate.callID === inputData.callID,
      )
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
          typeof options?.toolCallId === 'string' &&
          options.toolCallId.trim().length > 0
            ? options.toolCallId
            : undefined

        const ctx = {
          sessionID: input.sessionID,
          messageID: input.messageID,
          agent: input.agent.name,
          abort: options?.abortSignal ?? input.abortSignal,
          callID: toolCallID,
          messages: input.history,
          async metadata(metadataInput: {
            title?: string
            metadata?: Record<string, unknown>
          }) {
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

        const message = SessionStore.getMessageWithParts(
          input.sessionID,
          input.messageID,
        )
        if (message) {
          const lastThree = message.parts
            .filter(
              (part): part is ToolPart =>
                part.type === 'tool' && part.state.status !== 'pending',
            )
            .slice(-DOOM_LOOP_THRESHOLD)
          if (
            lastThree.length === DOOM_LOOP_THRESHOLD &&
            lastThree.every(
              (part) =>
                part.tool === item.id &&
                JSON.stringify(part.state.input) === JSON.stringify(args),
            )
          ) {
            await PermissionNext.ask({
              permission: 'doom_loop',
              patterns: [item.id],
              sessionID: input.sessionID,
              metadata: {
                tool: item.id,
                input: args,
              },
              always: [item.id],
              tool: toolCallID
                ? {
                    messageID: input.messageID,
                    callID: toolCallID,
                  }
                : undefined,
              ruleset,
            })
          }
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
  injectMaxStepsPrompt?: boolean
  step?: number
}

export async function streamAssistant(input: StreamAssistantInput) {
  const agentName = resolveAgentName(input.history)
  const fallbackName = await Agent.defaultAgent()
  const resolvedAgent =
    (agentName ? await Agent.get(agentName) : undefined) ??
    (await Agent.get(fallbackName))
  if (!resolvedAgent) {
    throw new Error('No active agent is configured')
  }

  // ---- Layer 1 + 2: Stable system content (environment + behavioral prompt) ----
  const stableSystem = [
    loadEnvironment({
      providerID: 'anthropic',
      modelID: 'k2p5',
    }),
    loadBehavior(),
  ].join('\n\n')

  // ---- Layer 3 + 4: Dynamic system content (agent prompt + instructions + curriculum) ----
  const dynamicParts: string[] = []
  if (resolvedAgent.prompt) {
    dynamicParts.push(resolvedAgent.prompt)
  }
  const instructions = await loadInstructions()
  dynamicParts.push(...instructions)
  const curriculum = await loadCurriculumContext()
  if (curriculum) {
    dynamicParts.push(curriculum)
  }

  // ---- Cache-split system prompt: two system messages ----
  // Part 1 is stable across calls (cacheable by providers like Anthropic).
  // Part 2 changes between sessions (instructions, curriculum status).
  const system: string[] = [stableSystem]
  if (dynamicParts.length > 0) {
    system.push(dynamicParts.join('\n\n'))
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

  // ---- Mid-loop queue wrapping ----
  // When the agent is mid-loop (step > 1) and the user sends a new message,
  // wrap it in <system-reminder> tags so the agent addresses it without being derailed.
  const step = input.step ?? 1
  if (step > 1) {
    // Find the last completed assistant message
    const lastAssistantIdx = [...input.history]
      .reverse()
      .findIndex((m) => m.info.role === 'assistant')
    const lastAssistantMessageId =
      lastAssistantIdx >= 0
        ? input.history[input.history.length - 1 - lastAssistantIdx]?.info.id
        : undefined

    for (const msg of input.history) {
      if (msg.info.role !== 'user') continue
      if (lastAssistantMessageId && msg.info.id <= lastAssistantMessageId)
        continue
      for (const part of msg.parts) {
        if (part.type !== 'text') continue
        if (!part.text.trim()) continue
        part.text = [
          '<system-reminder>',
          'The user sent the following message:',
          part.text,
          '',
          'Please address this message and continue with your tasks.',
          '</system-reminder>',
        ].join('\n')
      }
    }
  }

  // ---- Build messages: model messages + optional max-steps assistant prefix ----
  const modelMessages = toModelMessages(input.history)
  const messages = input.injectMaxStepsPrompt
    ? [
        ...modelMessages,
        { role: 'assistant' as const, content: loadMaxStepsPrompt() },
      ]
    : modelMessages
  const messagesWithSystem: ModelMessage[] = [
    ...system.map((content) => ({
      role: 'system' as const,
      content,
    })),
    ...messages,
  ]

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
        toolName: 'invalid',
      }
    },
    model: kimiModel(),
    messages: messagesWithSystem,
    temperature: 1.0,
    topP: 0.95,
    maxOutputTokens: 32_000,
    maxRetries: 0,
    activeTools: tools
      ? Object.keys(tools).filter((toolName) => toolName !== 'invalid')
      : undefined,
    tools,
    toolChoice: input.forceTextResponseOnly ? 'none' : 'auto',
    abortSignal: input.abortSignal,
  })
}
