# Notes For `refer-opencode`

## Current Decision Model

Buddy should continue selective OpenCode parity, not full forking, unless product goals converge to near-1:1 OpenCode behavior.

Default:

- parity-core => track and sync via `opencore-pairity/`
- buddy-product => intentional divergence, documented

## Where Dynamic Context Lives

- `opencore-pairity/CONTEXT.md` for intent/risk context
- `opencore-pairity/pairs.tsv` for current mappings
- `opencore-pairity/sync-checklist.md` for current process
- `opencore-pairity/sync-log.md` for recent decisions and outcomes

Do not duplicate those changing details in this file.

## When To Use OpenCode Notes Directory

OpenCode notes (`../opencode/notes/**`) are useful for orientation, but must be validated against live code.

Read notes only when needed for:

- architecture background (`notes/agent-loop-*`, `notes/event-*`)
- context/storage background (`notes/context-*`, `notes/message-*`)
- prior Buddy-specific architecture decisions (`notes/buddy/*`)

Do not treat notes as implementation source of truth.

## Practical Rule

Before recommending architecture:

1. read Buddy live code
2. read OpenCode live counterpart
3. run parity workflow from `opencore-pairity/sync-checklist.md` when task touches parity-core
4. then propose porting/fork/divergence decision
