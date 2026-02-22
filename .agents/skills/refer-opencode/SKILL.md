---
name: refer-opencode
description: Use OpenCode as the default reference for Buddy core infra, with parity-aware classification (parity-core vs buddy-product), mapped counterpart checks, and selective porting guidance.
---

## Purpose

Use OpenCode as the primary reference model for Buddy core infra while preserving Buddy-specific product behavior.

This skill is intentionally stable. It should not duplicate frequently changing parity data.
Dynamic parity state must live in `opencore-pairity/` and be read from there at runtime.

### Stack Alignment

| Component | OpenCode         | Buddy (Target) |
| --------- | ---------------- | -------------- |
| Backend   | Bun + Hono       | Bun + Hono     |
| Frontend  | SolidJS          | React + Vite   |
| Database  | SQLite (Drizzle) | SQLite         |
| Transport | HTTP + SSE       | HTTP + SSE     |
| Desktop   | Tauri            | Tauri          |
| LLM       | AI SDK           | AI SDK         |

## Repository Paths

- Buddy: current repo
- OpenCode: `~/code/opencode` (fallback `~/Code/opencode`)

## Stability Rule

- Keep this skill focused on durable process and decision logic.
- Do not store volatile parity state (mapped file lists, drift status, latest SHAs) here.
- If that data already exists in `opencore-pairity/`, reference it instead of copying it.

## Source Of Truth

1. Live code in Buddy and OpenCode
2. Buddy parity contract files in `opencore-pairity/`
3. This skill's reference docs (process-level only)

## Operating Model

Before recommending or implementing anything, classify the task:

1. `parity-core`: tool execution semantics, agent/session loop, permission engine, runtime/context plumbing, infra routes/contracts.
2. `buddy-product`: learning UX/domain behavior (curriculum, memory strategy, UI experience).

Rules:

- For `parity-core`, follow the parity contract and scripts in `opencore-pairity/`.
- For `buddy-product`, use OpenCode as inspiration only; keep Buddy-first behavior.
- If uncertain, default to `parity-core` for backend loop/tool/permission changes.

## Parity Workflow Entry Point

When task touches `parity-core`, use these files directly:

- `opencore-pairity/README.md`
- `opencore-pairity/sync-checklist.md`
- `opencore-pairity/pairs.tsv`
- `opencore-pairity/CONTEXT.md`
- `opencore-pairity/sync-log.md`

## References

For detailed information, see:

- **[FILES.md](references/FILES.md)** - Durable file navigation and where to fetch dynamic parity state
- **[PATTERNS.md](references/PATTERNS.md)** - Stable process patterns (delegates live details to parity folder)
- **[NOTES.md](references/NOTES.md)** - Durable decision model and risk framing
- **[STYLE.md](references/STYLE.md)** - Porting style rules that should stay stable

---
