import { logSession } from './debug.js'
import { SessionStore } from './session-store.js'
import type { MessageToolPart } from './message-v2/index.js'

// ---------------------------------------------------------------------------
// Token estimation (same heuristic as OpenCode)
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.max(0, Math.round((text || '').length / CHARS_PER_TOKEN))
}

// ---------------------------------------------------------------------------
// Pruning constants
// ---------------------------------------------------------------------------

/** Keep this many tokens of tool outputs (most recent) */
const PRUNE_PROTECT = 40_000

/** Don't prune unless total tool output exceeds this */
const PRUNE_MINIMUM = 20_000

/** Number of most recent user turns to always protect */
const PRUNE_KEEP_RECENT_TURNS = 2

/** Tools whose output should never be pruned */
const PROTECTED_TOOLS = new Set(['skill'])

// ---------------------------------------------------------------------------
// Prune old tool outputs to reduce context size
// ---------------------------------------------------------------------------

/**
 * Walk backwards through tool calls and mark older results as compacted once
 * they exceed the protected token budget. Output text is preserved in storage;
 * message conversion masks compacted outputs with a fixed marker.
 */
export function prune(input: { sessionID: string }) {
  const messages = SessionStore.listMessages(input.sessionID)
  if (messages.length === 0) return

  // Find the boundary: skip the last N user turns
  let userTurnsFromEnd = 0
  let protectBoundaryIdx = messages.length

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === 'user') {
      userTurnsFromEnd++
      if (userTurnsFromEnd >= PRUNE_KEEP_RECENT_TURNS) {
        protectBoundaryIdx = i
        break
      }
    }
  }
  if (userTurnsFromEnd < PRUNE_KEEP_RECENT_TURNS) {
    return
  }

  // Collect tool outputs from BEFORE the protected boundary, newest first
  const candidates: {
    messageIdx: number
    partIdx: number
    tokens: number
    part: MessageToolPart
  }[] = []
  let totalToolTokens = 0

  for (let mi = protectBoundaryIdx - 1; mi >= 0; mi--) {
    const msg = messages[mi]
    for (let pi = msg.parts.length - 1; pi >= 0; pi--) {
      const part = msg.parts[pi]
      if (part.type !== 'tool') continue
      if (part.state.status !== 'completed') continue
      if (PROTECTED_TOOLS.has(part.tool)) continue
      if (part.state.time.compacted) continue

      const tokens = estimateTokens(part.state.output)
      candidates.push({ messageIdx: mi, partIdx: pi, tokens, part })
      totalToolTokens += tokens
    }
  }

  if (totalToolTokens < PRUNE_MINIMUM) return // not enough to prune

  // Walk from newest to oldest, protecting the first PRUNE_PROTECT tokens
  let protectedTokens = 0
  let pruneCount = 0

  for (const candidate of candidates) {
    if (protectedTokens < PRUNE_PROTECT) {
      protectedTokens += candidate.tokens
      continue // keep this one
    }

    // Mark as compacted while preserving original output in storage.
    if (candidate.part.state.status !== 'completed') continue
    const prunedPart: MessageToolPart = {
      ...candidate.part,
      state: {
        status: 'completed' as const,
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
    SessionStore.updatePart(prunedPart)
    pruneCount++
  }

  if (pruneCount > 0) {
    logSession('compaction.pruned', {
      sessionID: input.sessionID,
      prunedCount: pruneCount,
      totalCandidates: candidates.length,
      totalToolTokens,
      protectedTokens,
    })
  }
}

// ---------------------------------------------------------------------------
// Overflow detection (logs warning, does not trigger compaction LLM)
// ---------------------------------------------------------------------------

/**
 * Check if the last assistant response's token usage indicates context overflow.
 * Currently just logs a warning. LLM-driven compaction will be added when needed.
 *
 * @param contextLimit - The model's total context window in tokens
 * @param maxOutput - The max output tokens configured
 * @param lastUsageTotal - The total tokens used in the last response
 */
export function checkOverflow(input: {
  sessionID: string
  contextLimit: number
  maxOutput: number
  lastUsageTotal: number | undefined
}): boolean {
  if (!input.lastUsageTotal) return false

  const reserved = Math.min(20_000, input.maxOutput)
  const usable = input.contextLimit - input.maxOutput - reserved

  if (input.lastUsageTotal >= usable) {
    logSession('compaction.overflow_detected', {
      sessionID: input.sessionID,
      usedTokens: input.lastUsageTotal,
      usableLimit: usable,
      contextLimit: input.contextLimit,
    })
    return true
  }
  return false
}

export const isOverflow = checkOverflow
