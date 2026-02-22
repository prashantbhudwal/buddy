import { Config } from "../config/config.js"
import { logSession } from "./debug.js"
import { SessionStore } from "./session-store.js"
import type { MessageToolPart } from "./message-v2/index.js"

const CHARS_PER_TOKEN = 4
const COMPACTION_BUFFER = 20_000
const PRUNE_PROTECT = 40_000
const PRUNE_MINIMUM = 20_000
const PRUNE_KEEP_RECENT_TURNS = 2
const PRUNE_PROTECTED_TOOLS = new Set(["skill"])

function estimateTokens(text: string): number {
  return Math.max(0, Math.round((text || "").length / CHARS_PER_TOKEN))
}

export async function prune(input: { sessionID: string }) {
  const config = await Config.get()
  if (config.compaction?.prune === false) return

  const messages = SessionStore.listMessages(input.sessionID)
  if (messages.length === 0) return

  let userTurnsFromEnd = 0
  let protectBoundaryIdx = messages.length

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].info.role === "user") {
      userTurnsFromEnd += 1
      if (userTurnsFromEnd >= PRUNE_KEEP_RECENT_TURNS) {
        protectBoundaryIdx = i
        break
      }
    }
  }

  if (userTurnsFromEnd < PRUNE_KEEP_RECENT_TURNS) {
    return
  }

  const candidates: Array<{
    tokens: number
    part: MessageToolPart
  }> = []

  let totalToolTokens = 0

  for (let messageIndex = protectBoundaryIdx - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex]
      if (part.type !== "tool") continue
      if (part.state.status !== "completed") continue
      if (PRUNE_PROTECTED_TOOLS.has(part.tool)) continue
      if (part.state.time.compacted) continue

      const tokens = estimateTokens(part.state.output)
      totalToolTokens += tokens
      candidates.push({ tokens, part })
    }
  }

  if (totalToolTokens < PRUNE_MINIMUM) {
    return
  }

  let protectedTokens = 0
  let pruneCount = 0

  for (const candidate of candidates) {
    if (protectedTokens < PRUNE_PROTECT) {
      protectedTokens += candidate.tokens
      continue
    }

    if (candidate.part.state.status !== "completed") continue

    const next: MessageToolPart = {
      ...candidate.part,
      state: {
        status: "completed",
        input: candidate.part.state.input,
        output: candidate.part.state.output,
        metadata: candidate.part.state.metadata,
        title: candidate.part.state.title,
        time: {
          ...candidate.part.state.time,
          compacted: Date.now(),
        },
      },
    }

    SessionStore.updatePart(next)
    pruneCount += 1
  }

  if (pruneCount > 0) {
    logSession("compaction.pruned", {
      sessionID: input.sessionID,
      prunedCount: pruneCount,
      totalCandidates: candidates.length,
      totalToolTokens,
      protectedTokens,
    })
  }
}

export async function checkOverflow(input: {
  sessionID: string
  contextLimit: number
  maxOutput: number
  lastUsageTotal: number | undefined
}) {
  const config = await Config.get()
  if (config.compaction?.auto === false) return false

  if (!input.lastUsageTotal) return false

  const reserved = config.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, input.maxOutput)
  const usable = input.contextLimit - input.maxOutput - reserved

  if (input.lastUsageTotal >= usable) {
    logSession("compaction.overflow_detected", {
      sessionID: input.sessionID,
      usedTokens: input.lastUsageTotal,
      usableLimit: usable,
      contextLimit: input.contextLimit,
      reserved,
    })
    return true
  }

  return false
}

export const isOverflow = checkOverflow
