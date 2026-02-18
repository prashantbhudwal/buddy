---
name: refer-opencode
description: Buddy agent is modeled after `opencode` - the coding agent. Use this skill whenever the user asks a question about `opencode`, `opencode codebase`, `oc` explictly. Or you want to look at any of opencode patterns to fulfill user's request about buddy development.
---

## What I Do

I provide implementation guidance by referencing the OpenCode codebase at `../opencode` (sibling to this repo).

## When to Use Me

- Implementing SSE event streaming
- Setting up OpenAPI routes with Hono + Zod
- Building the agent loop and message/parts system
- Configuring Tauri with a sidecar backend
- Setting up event bus architecture
- Understanding message storage patterns
- Aligning monorepo tooling and UI setup (Turbo, shadcn/ui)

---

## Architecture Overview

### Stack Alignment

| Component | OpenCode         | Buddy (Target) |
| --------- | ---------------- | -------------- |
| Backend   | Bun + Hono       | Bun + Hono     |
| Frontend  | SolidJS          | React + Vite   |
| Database  | SQLite (Drizzle) | SQLite         |
| Transport | HTTP + SSE       | HTTP + SSE     |
| Desktop   | Tauri            | Tauri          |
| LLM       | AI SDK           | AI SDK         |

---

## References

For detailed information, see:

- **[FILES.md](references/FILES.md)** - Key file paths organized by category
- **[PATTERNS.md](references/PATTERNS.md)** - Implementation patterns with code examples
- **[NOTES.md](references/NOTES.md)** - notes on architecture, and major parts of the agent loop.

---
