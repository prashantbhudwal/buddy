# OpenCode Notes Directory Reference

Detailed exploration notes exist at `../opencode/notes/`. These contain deep-dives into specific subsystems.

## Buddy-Specific Notes

Located at `../opencode/notes/buddy/`:

| File                                                    | Content                          |
| ------------------------------------------------------- | -------------------------------- |
| `notes/buddy/data-fetching-opencode.md`                 | SSE vs Query, store architecture |
| `notes/buddy/openapi.md`                                | OpenAPI + Hono setup guide       |
| `notes/buddy/2025-02-17-client-server-communication.md` | HTTP+SSE pattern                 |
| `notes/buddy/2025-02-17-tauri-decision.md`              | Tauri sidecar architecture       |
| `notes/buddy/2025-02-17-api-choice.md`                  | OpenAPI vs tRPC decision         |

## Core Architecture Notes

| File                                     | Content                          |
| ---------------------------------------- | -------------------------------- |
| `notes/event-bus-architecture.md`        | Three-tier event bus             |
| `notes/event-buffering.md`               | Client-side coalescing           |
| `notes/agent-loop-flow.md`               | Complete agent loop walkthrough  |
| `notes/agent-loop-top-down.md`           | High-level agent loop overview   |
| `notes/agent-loop-events.md`             | Events emitted by agent loop     |
| `notes/agent-loop-detailed-states.md`    | State machine details            |
| `notes/agent-loop-example.md`            | Example walkthrough              |

## Data & Storage Notes

| File                                     | Content                          |
| ---------------------------------------- | -------------------------------- |
| `notes/message-storage-structure.md`     | Storage layout + data types      |
| `notes/message-parts-summary.md`         | Part types overview              |
| `notes/context-management.md`            | System prompts, compaction       |
| `notes/context-system.md`                | Context loading system           |

## UI Notes

| File                                     | Content                          |
| ---------------------------------------- | -------------------------------- |
| `notes/ui-orchestration.md`              | Rendering pipeline               |
| `notes/ui-rendering-logic.md`            | Component structure              |

## Monorepo/UI Gotchas (Buddy)

- Turborepo v2 expects `tasks` in `turbo.json` (not `pipeline`).
- OpenCode uses root scripts with `bun --cwd packages/<pkg> ...` rather than a single combined dev command.
- Tailwind v4 + workspace UI packages: add `@source "./**/*.{ts,tsx}";` to the UI package CSS to ensure shadcn component utility classes get generated.

## When to Read These

- **data-fetching-opencode.md** - When deciding between SSE vs polling vs TanStack Query
- **event-bus-architecture.md** - When setting up the three-tier event system
- **agent-loop-flow.md** - When implementing the main agent conversation loop
- **message-storage-structure.md** - When designing the storage schema
- **openapi.md** - When setting up OpenAPI routes with Hono + Zod
