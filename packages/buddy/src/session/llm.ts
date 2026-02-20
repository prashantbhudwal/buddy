import { streamText, type ModelMessage } from 'ai'
import { loadLearningPrompt, loadMaxStepsPrompt } from './system-prompt.js'
import { kimiModel } from './kimi.js'
import { createChatTools } from './tools.js'
import type { MessageWithParts } from './message-v2/index.js'

function joinUserText(message: MessageWithParts) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function joinAssistantText(message: MessageWithParts) {
  const fragments: string[] = []
  for (const part of message.parts) {
    if (part.type === 'text') {
      fragments.push(part.text)
      continue
    }
    if (part.type !== 'tool') continue
    if (part.state.status === 'completed') {
      fragments.push(`[tool:${part.tool}]\n${part.state.output}`)
    }
    if (part.state.status === 'error') {
      fragments.push(`[tool:${part.tool} error] ${part.state.error}`)
    }
  }
  return fragments.join('\n\n').trim()
}

function toModelMessages(history: MessageWithParts[]) {
  const messages: ModelMessage[] = []

  for (const message of history) {
    if (message.info.role === 'user') {
      const content = joinUserText(message)
      if (!content) continue
      messages.push({
        role: 'user',
        content,
      })
      continue
    }

    const content = joinAssistantText(message)
    if (!content) continue
    messages.push({
      role: 'assistant',
      content,
    })
  }

  return messages
}

type StreamAssistantInput = {
  history: MessageWithParts[]
  abortSignal: AbortSignal
  forceTextResponseOnly?: boolean
}

export async function streamAssistant(input: StreamAssistantInput) {
  const systemSections = [await loadLearningPrompt()]
  if (input.forceTextResponseOnly) {
    systemSections.push(await loadMaxStepsPrompt())
  }

  const tools = input.forceTextResponseOnly ? undefined : createChatTools()

  return streamText({
    model: kimiModel(),
    system: systemSections.join('\n\n'),
    messages: toModelMessages(input.history),
    temperature: 1.0,
    topP: 0.95,
    maxOutputTokens: 32_000,
    maxRetries: 0,
    tools,
    toolChoice: input.forceTextResponseOnly ? 'none' : 'auto',
    abortSignal: input.abortSignal,
  })
}
