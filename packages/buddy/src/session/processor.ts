import { Agent } from "../agent/agent.js"
import { Bus } from "../bus/index.js"
import { Config } from "../config/config.js"
import { PermissionNext } from "../permission/next.js"
import { streamAssistant } from "./llm.js"
import { errorSession, logSession } from "./debug.js"
import { newPartID } from "./id.js"
import {
  MessageEvents,
  type AssistantMessage,
  type MessagePart,
  type MessageReasoningPart,
  type MessageTextPart,
  type MessageToolPart,
} from "./message-v2/index.js"
import { SessionInfo } from "./session-info.js"
import { SessionStore } from "./session-store.js"
import { prune, checkOverflow } from "./compaction.js"
import { clearClaimed } from "./instruction.js"

type ProcessInput = {
  sessionID: string
  assistantMessageID: string
  abortSignal: AbortSignal
}

type UsageSummary = {
  total: number | undefined
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}

type StepResult = {
  finishReason?: string
  usage: UsageSummary
  sawToolActivity: boolean
  sawTaskToolActivity: boolean
  sawTextOutput: boolean
  blockedByDeny: boolean
}

const DEFAULT_MAX_LOOP_STEPS = 8
const MAX_LOOP_STEPS_HARD_CAP = 24

function emptyUsage(): UsageSummary {
  return {
    total: undefined,
    input: 0,
    output: 0,
    reasoning: 0,
    cache: {
      read: 0,
      write: 0,
    },
  }
}

function usageFromEvent(value: unknown): UsageSummary {
  const usage = (value as { usage?: Record<string, number> }).usage
  return {
    total: usage?.totalTokens,
    input: usage?.inputTokens ?? 0,
    output: usage?.outputTokens ?? 0,
    reasoning: usage?.reasoningTokens ?? 0,
    cache: {
      read: usage?.cachedInputTokens ?? 0,
      write: usage?.cacheWriteInputTokens ?? 0,
    },
  }
}

function mergeUsage(total: UsageSummary, step: UsageSummary): UsageSummary {
  const mergedTotal =
    typeof total.total === "number" && typeof step.total === "number"
      ? total.total + step.total
      : (total.total ?? step.total)

  return {
    total: mergedTotal,
    input: total.input + step.input,
    output: total.output + step.output,
    reasoning: total.reasoning + step.reasoning,
    cache: {
      read: total.cache.read + step.cache.read,
      write: total.cache.write + step.cache.write,
    },
  }
}

function resolveMaxLoopSteps(agentSteps: number | undefined) {
  const value = agentSteps ?? DEFAULT_MAX_LOOP_STEPS
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_LOOP_STEPS
  return Math.min(Math.floor(value), MAX_LOOP_STEPS_HARD_CAP)
}

function outputToString(output: unknown) {
  if (typeof output === "string") {
    return output
  }
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

function parseToolResult(output: unknown) {
  if (typeof output === "object" && output !== null) {
    const value = output as Record<string, unknown>
    const direct = value.output
    return {
      output: outputToString(direct === undefined ? output : direct),
      metadata: value.metadata as Record<string, any> | undefined,
      title: value.title as string | undefined,
    }
  }

  return {
    output: outputToString(output),
    metadata: undefined,
    title: undefined,
  }
}

async function publishPart(part: MessagePart) {
  await Bus.publish(MessageEvents.PartUpdated, { part })
}

async function publishDelta(input: {
  sessionID: string
  messageID: string
  partID: string
  field: string
  delta: string
}) {
  await Bus.publish(MessageEvents.PartDelta, input)
}

async function publishMessage(info: AssistantMessage) {
  await Bus.publish(MessageEvents.Updated, { info })
}

async function finalizeInFlightToolParts(input: {
  sessionID: string
  messageID: string
  reason: string
}) {
  const message = SessionStore.getMessageWithParts(input.sessionID, input.messageID)
  if (!message) return

  for (const part of message.parts) {
    if (part.type !== "tool") continue
    if (part.state.status === "completed" || part.state.status === "error") continue

    const now = Date.now()
    const start = part.state.status === "running" && part.state.time?.start ? part.state.time.start : now

    const next: MessageToolPart = {
      ...part,
      state: {
        status: "error",
        input: part.state.input,
        error: input.reason,
        time: {
          start,
          end: now,
        },
      },
    }
    SessionStore.updatePart(next)
    await publishPart(next)
  }
}

async function processStep(input: {
  sessionID: string
  assistantMessageID: string
  abortSignal: AbortSignal
  step: number
  forceTextResponseOnly: boolean
  injectMaxStepsPrompt: boolean
  breakOnDeniedTool: boolean
}): Promise<StepResult> {
  const reasoningParts = new Map<string, MessageReasoningPart>()
  const toolParts = new Map<string, MessageToolPart>()
  let currentTextPart: MessageTextPart | undefined
  let finishReason: string | undefined
  let usage = emptyUsage()
  let sawToolActivity = false
  let sawTaskToolActivity = false
  let sawTextOutput = false
  let blockedByDeny = false

  const history = SessionStore.listMessages(input.sessionID)
  logSession("processor.step.history.loaded", {
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    step: input.step,
    count: history.length,
    forceTextResponseOnly: input.forceTextResponseOnly,
  })

  const stream = await streamAssistant({
    sessionID: input.sessionID,
    messageID: input.assistantMessageID,
    history,
    abortSignal: input.abortSignal,
    forceTextResponseOnly: input.forceTextResponseOnly,
    injectMaxStepsPrompt: input.injectMaxStepsPrompt,
    step: input.step,
  })
  logSession("processor.step.stream.created", {
    sessionID: input.sessionID,
    assistantMessageID: input.assistantMessageID,
    step: input.step,
  })

  for await (const value of stream.fullStream) {
    input.abortSignal.throwIfAborted()

    try {
      switch (value.type) {
        case "reasoning-start": {
          logSession("processor.reasoning.start", {
            sessionID: input.sessionID,
            step: input.step,
            streamPartID: value.id,
          })
          const part: MessageReasoningPart = {
            id: newPartID(),
            messageID: input.assistantMessageID,
            sessionID: input.sessionID,
            type: "reasoning",
            text: "",
            time: {
              start: Date.now(),
            },
            metadata: value.providerMetadata,
          }
          reasoningParts.set(value.id, part)
          SessionStore.updatePart(part)
          await publishPart(part)
          break
        }
        case "reasoning-delta": {
          const part = reasoningParts.get(value.id)
          if (!part) break
          part.text += value.text
          SessionStore.updatePartDelta({
            sessionID: part.sessionID,
            messageID: part.messageID,
            partID: part.id,
            field: "text",
            delta: value.text,
          })
          await publishDelta({
            sessionID: part.sessionID,
            messageID: part.messageID,
            partID: part.id,
            field: "text",
            delta: value.text,
          })
          break
        }
        case "reasoning-end": {
          logSession("processor.reasoning.end", {
            sessionID: input.sessionID,
            step: input.step,
            streamPartID: value.id,
          })
          const part = reasoningParts.get(value.id)
          if (!part) break
          const next: MessageReasoningPart = {
            ...part,
            time: {
              ...part.time,
              end: Date.now(),
            },
            metadata: value.providerMetadata,
          }
          SessionStore.updatePart(next)
          await publishPart(next)
          reasoningParts.delete(value.id)
          break
        }
        case "text-start": {
          logSession("processor.text.start", {
            sessionID: input.sessionID,
            step: input.step,
          })
          const part: MessageTextPart = {
            id: newPartID(),
            messageID: input.assistantMessageID,
            sessionID: input.sessionID,
            type: "text",
            text: "",
            time: {
              start: Date.now(),
            },
            metadata: value.providerMetadata,
          }
          currentTextPart = part
          SessionStore.updatePart(part)
          await publishPart(part)
          break
        }
        case "text-delta": {
          if (!currentTextPart) break
          currentTextPart.text += value.text
          SessionStore.updatePartDelta({
            sessionID: currentTextPart.sessionID,
            messageID: currentTextPart.messageID,
            partID: currentTextPart.id,
            field: "text",
            delta: value.text,
          })
          await publishDelta({
            sessionID: currentTextPart.sessionID,
            messageID: currentTextPart.messageID,
            partID: currentTextPart.id,
            field: "text",
            delta: value.text,
          })
          break
        }
        case "text-end": {
          logSession("processor.text.end", {
            sessionID: input.sessionID,
            step: input.step,
          })
          if (!currentTextPart) break
          const next: MessageTextPart = {
            ...currentTextPart,
            time: {
              start: currentTextPart.time?.start ?? Date.now(),
              end: Date.now(),
            },
            metadata: value.providerMetadata,
          }
          SessionStore.updatePart(next)
          await publishPart(next)
          if (next.text.trim().length > 0) {
            sawTextOutput = true
          }
          currentTextPart = undefined
          break
        }
        case "tool-input-start": {
          logSession("processor.tool.pending", {
            sessionID: input.sessionID,
            step: input.step,
            tool: value.toolName,
            toolCallID: value.id,
          })
          const part: MessageToolPart = {
            id: newPartID(),
            messageID: input.assistantMessageID,
            sessionID: input.sessionID,
            type: "tool",
            tool: value.toolName,
            callID: value.id,
            state: {
              status: "pending",
              input: {},
              raw: "",
            },
          }
          toolParts.set(value.id, part)
          SessionStore.updatePart(part)
          await publishPart(part)
          break
        }
        case "tool-call": {
          sawToolActivity = true
          if (value.toolName === "task") {
            sawTaskToolActivity = true
          }
          logSession("processor.tool.running", {
            sessionID: input.sessionID,
            step: input.step,
            tool: value.toolName,
            toolCallID: value.toolCallId,
          })

          const existing = toolParts.get(value.toolCallId)
          if (!existing) break

          const running: MessageToolPart = {
            ...existing,
            tool: value.toolName,
            state: {
              status: "running",
              input: value.input as Record<string, any>,
              time: {
                start: Date.now(),
              },
            },
            metadata: value.providerMetadata as Record<string, any> | undefined,
          }
          toolParts.set(value.toolCallId, running)
          SessionStore.updatePart(running)
          await publishPart(running)
          break
        }
        case "tool-result": {
          sawToolActivity = true
          logSession("processor.tool.completed", {
            sessionID: input.sessionID,
            step: input.step,
            toolCallID: value.toolCallId,
          })
          const existing = toolParts.get(value.toolCallId)
          if (!existing || existing.state.status !== "running") break

          if (existing.tool === "task") {
            sawTaskToolActivity = true
          }

          const parsedOutput = parseToolResult(value.output)
          const completed: MessageToolPart = {
            ...existing,
            state: {
              status: "completed",
              input: value.input ?? existing.state.input,
              output: parsedOutput.output,
              metadata: parsedOutput.metadata,
              title: parsedOutput.title,
              time: {
                start: existing.state.time.start,
                end: Date.now(),
              },
            },
          }
          SessionStore.updatePart(completed)
          await publishPart(completed)
          toolParts.delete(value.toolCallId)
          break
        }
        case "tool-error": {
          sawToolActivity = true
          errorSession("processor.tool.error", value.error, {
            sessionID: input.sessionID,
            step: input.step,
            toolCallID: value.toolCallId,
          })
          const existing = toolParts.get(value.toolCallId)
          if (!existing || existing.state.status !== "running") break
          if (existing.tool === "task") {
            sawTaskToolActivity = true
          }

          if (input.breakOnDeniedTool && value.error instanceof PermissionNext.RejectedError) {
            blockedByDeny = true
          }

          const failed: MessageToolPart = {
            ...existing,
            state: {
              status: "error",
              input: value.input ?? existing.state.input,
              error: String(value.error),
              time: {
                start: existing.state.time.start,
                end: Date.now(),
              },
            },
          }
          SessionStore.updatePart(failed)
          await publishPart(failed)
          toolParts.delete(value.toolCallId)
          break
        }
        case "finish-step": {
          finishReason = value.finishReason
          usage = usageFromEvent(value)
          logSession("processor.finish-step", {
            sessionID: input.sessionID,
            step: input.step,
            finishReason,
            sawToolActivity,
            sawTaskToolActivity,
            sawTextOutput,
            blockedByDeny,
          })
          break
        }
        case "error": {
          errorSession("processor.stream.error", value.error, {
            sessionID: input.sessionID,
            step: input.step,
          })
          throw value.error
        }
        default: {
          break
        }
      }
    } catch (eventError) {
      errorSession("processor.event.failed", eventError, {
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        step: input.step,
        eventType: value.type,
      })
      throw eventError
    }
  }

  return {
    finishReason,
    usage,
    sawToolActivity,
    sawTaskToolActivity,
    sawTextOutput,
    blockedByDeny,
  }
}

export async function processAssistantResponse(input: ProcessInput) {
  let finalFinishReason: string | undefined
  let wasAborted = false
  let hasFailed = false
  let maxStepsReached = false
  let messageUsage = emptyUsage()
  let forceTextAfterTask = false

  const assistant = SessionStore.getAssistantInfo(input.sessionID, input.assistantMessageID)
  const assistantAgent = assistant ? await Agent.get(assistant.agent) : undefined
  const maxLoopSteps = resolveMaxLoopSteps(assistantAgent?.steps)

  const breakOnDeniedTool = (await Config.get()).experimental?.continue_loop_on_deny !== true

  try {
    logSession("processor.start", {
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
      maxLoopSteps,
      breakOnDeniedTool,
    })

    for (let step = 1; step <= maxLoopSteps; step += 1) {
      input.abortSignal.throwIfAborted()
      const injectMaxStepsPrompt = step === maxLoopSteps
      const forceTextResponseOnly = injectMaxStepsPrompt || forceTextAfterTask

      logSession("processor.step.begin", {
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        step,
        forceTextResponseOnly,
        injectMaxStepsPrompt,
      })

      const result = await processStep({
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        abortSignal: input.abortSignal,
        step,
        forceTextResponseOnly,
        injectMaxStepsPrompt,
        breakOnDeniedTool,
      })

      messageUsage = mergeUsage(messageUsage, result.usage)
      finalFinishReason = result.finishReason ?? finalFinishReason
      if (result.sawTaskToolActivity && !forceTextAfterTask) {
        forceTextAfterTask = true
        logSession("processor.force_text_after_task", {
          sessionID: input.sessionID,
          assistantMessageID: input.assistantMessageID,
          step,
        })
      }

      const shouldContinue =
        !forceTextResponseOnly &&
        !result.blockedByDeny &&
        (result.finishReason === "tool-calls" ||
          result.finishReason === "unknown" ||
          (result.sawToolActivity && !result.sawTextOutput))

      logSession("processor.step.completed", {
        sessionID: input.sessionID,
        assistantMessageID: input.assistantMessageID,
        step,
        finishReason: result.finishReason,
        sawToolActivity: result.sawToolActivity,
        sawTaskToolActivity: result.sawTaskToolActivity,
        sawTextOutput: result.sawTextOutput,
        blockedByDeny: result.blockedByDeny,
        shouldContinue,
        forceTextAfterTask,
      })

      if (!shouldContinue) {
        break
      }

      if (forceTextResponseOnly) {
        maxStepsReached = true
        break
      }
    }

    if (finalFinishReason === "tool-calls" || finalFinishReason === "unknown") {
      maxStepsReached = true
    }
  } catch (error) {
    wasAborted = input.abortSignal.aborted
    hasFailed = !wasAborted
    errorSession("processor.failed", error, {
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
      wasAborted,
    })

    const current = SessionStore.getAssistantInfo(input.sessionID, input.assistantMessageID)
    if (current) {
      const next: AssistantMessage = {
        ...current,
        error: wasAborted ? undefined : String(error),
      }
      SessionStore.updateMessage(next)
      await publishMessage(next)
    }
  } finally {
    logSession("processor.finalizing", {
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
      wasAborted,
      hasFailed,
      maxStepsReached,
      finishReason: finalFinishReason,
    })

    const current = SessionStore.getAssistantInfo(input.sessionID, input.assistantMessageID)
    if (current) {
      if (wasAborted || hasFailed || maxStepsReached) {
        await finalizeInFlightToolParts({
          sessionID: input.sessionID,
          messageID: input.assistantMessageID,
          reason: wasAborted ? "Tool execution aborted" : hasFailed ? "Tool execution failed" : "Stopped at max steps",
        })
      }

      const next: AssistantMessage = {
        ...current,
        finish:
          current.finish ??
          (wasAborted
            ? "aborted"
            : hasFailed
              ? "error"
              : maxStepsReached
                ? "max-steps"
                : (finalFinishReason ?? "stop")),
        tokens: messageUsage,
        time: {
          ...current.time,
          completed: Date.now(),
        },
      }
      SessionStore.updateMessage(next)
      await publishMessage(next)
    }

    await prune({ sessionID: input.sessionID })

    await checkOverflow({
      sessionID: input.sessionID,
      contextLimit: 128_000,
      maxOutput: 32_000,
      lastUsageTotal: messageUsage.total,
    })

    SessionStore.clearActiveAbort(input.sessionID)
    clearClaimed(input.assistantMessageID)
    await Bus.publish(SessionInfo.Event.Status, {
      sessionID: input.sessionID,
      status: "idle",
    })
    logSession("processor.status.idle", {
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
    })
  }
}
