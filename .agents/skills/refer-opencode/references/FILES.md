# Key Reference Files

OpenCode codebase is at `../opencode` (sibling to buddy repo).

## Server Routes

| File                                             | Purpose                             |
| ------------------------------------------------ | ----------------------------------- |
| `packages/opencode/src/server/routes/global.ts`  | SSE endpoint + health check         |
| `packages/opencode/src/server/routes/session.ts` | Session management, prompt handling |
| `packages/opencode/src/server/routes/config.ts`  | Configuration endpoints             |

## Event System

| File                                     | Purpose                              |
| ---------------------------------------- | ------------------------------------ |
| `packages/opencode/src/bus/index.ts`     | Instance Bus (project-scoped events) |
| `packages/opencode/src/bus/global.ts`    | Global Bus (process-wide events)     |
| `packages/opencode/src/bus/bus-event.ts` | Event definitions with Zod schemas   |

## Client-Side SSE

| File                                                  | Purpose                          |
| ----------------------------------------------------- | -------------------------------- |
| `packages/app/src/context/global-sync.tsx`            | SSE connection + event buffering |
| `packages/app/src/context/global-sdk.tsx`             | SDK client setup                 |
| `packages/app/src/context/global-sync/child-store.ts` | Per-project store creation       |

## Agent Loop

| File                                          | Purpose                                |
| --------------------------------------------- | -------------------------------------- |
| `packages/opencode/src/session/prompt.ts`     | Main agent loop (conversation manager) |
| `packages/opencode/src/session/processor.ts`  | Processor loop (single AI interaction) |
| `packages/opencode/src/session/message-v2.ts` | Message/part data structures           |

## Storage

| File                                       | Purpose                          |
| ------------------------------------------ | -------------------------------- |
| `packages/opencode/src/storage/index.ts`   | Storage abstraction (JSON files) |
| `packages/opencode/src/session/session.ts` | Session data management          |

## Tauri Desktop

| File                                         | Purpose                           |
| -------------------------------------------- | --------------------------------- |
| `packages/desktop/src-tauri/tauri.conf.json` | Tauri config (Vite URL + sidecar) |
| `packages/desktop/src-tauri/src/server.rs`   | Sidecar spawning + health checks  |
| `packages/desktop/src-tauri/src/lib.rs`      | Tauri command bindings            |

## SDK Generation

| File                                       | Purpose                               |
| ------------------------------------------ | ------------------------------------- |
| `packages/sdk/js/script/build.ts`          | SDK build script (hey-api/openapi-ts) |
| `packages/sdk/js/src/v2/gen/client.gen.ts` | Generated HTTP client                 |
| `packages/sdk/js/src/v2/gen/types.gen.ts`  | Generated TypeScript types            |

## Context & System Prompts

| File                                        | Purpose                       |
| ------------------------------------------- | ----------------------------- |
| `packages/opencode/src/session/system.ts`   | Base system prompts           |
| `packages/opencode/src/session/instruction.ts` | Dynamic instruction file loading |
| `packages/opencode/src/session/compaction.ts` | Context overflow handling     |

## Tool System

| File                                    | Purpose                  |
| --------------------------------------- | ------------------------ |
| `packages/opencode/src/tool/tool.ts`    | Tool interface & context |
| `packages/opencode/src/tool/read.ts`    | File reading tool        |
| `packages/opencode/src/tool/write.ts`   | File writing tool        |
| `packages/opencode/src/tool/edit.ts`    | File editing tool        |
| `packages/opencode/src/task/tool.ts`    | Subagent task tool       |
