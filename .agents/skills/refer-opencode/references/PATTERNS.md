# Implementation Patterns

Code examples from OpenCode for buddy development.

## 1. SSE Endpoint (Hono)

```typescript
// packages/opencode/src/server/routes/global.ts:41-108
import { streamSSE } from 'hono/streaming'

app.get('/event', async (c) => {
  c.header('X-Accel-Buffering', 'no')
  return streamSSE(c, async (stream) => {
    // Send connected event
    stream.writeSSE({
      data: JSON.stringify({
        payload: { type: 'server.connected', properties: {} },
      }),
    })

    // Subscribe to global bus
    GlobalBus.on('event', handler)

    // Heartbeat every 10-30s (prevents timeout)
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: JSON.stringify({
          payload: { type: 'server.heartbeat', properties: {} },
        }),
      })
    }, 10_000)

    // Handle abort
    stream.onAbort(() => {
      clearInterval(heartbeat)
      GlobalBus.off('event', handler)
    })
  })
})
```

## 2. Event Buffering (Client-Side)

```typescript
// packages/app/src/context/global-sync.tsx
// High-frequency events → 16ms buffer → batch update

let queue = []
const coalesced = new Map<string, number>()

// Coalesce: if same key, replace old event with new
if (existingIndex !== undefined) {
  queue[existingIndex] = undefined // mark for skip
}
coalesced.set(key, queue.length)
queue.push(event)

// Throttle: flush every 16ms (60fps)
timer = setTimeout(flush, Math.max(0, 16 - elapsed))
```

## 3. OpenAPI Route Pattern

```typescript
import { describeRoute, validator, resolver } from 'hono-openapi'
import z from 'zod'

const Schema = z.object({
  sessionID: z.string(),
  text: z.string(),
})

app.post(
  '/session/prompt',
  describeRoute({
    summary: 'Send prompt',
    request: {
      body: {
        content: {
          'application/json': { schema: resolver(Schema) },
        },
      },
    },
  }),
  validator('json', Schema),
  async (c) => {
    const body = c.req.valid('json') // typed!
    return c.json({ success: true })
  },
)
```

## 4. SDK Generation Workflow

```bash
# 1. Backend exposes OpenAPI spec
app.get("/doc", (c) => c.json(app.getOpenAPIDocument()))

# 2. Generate SDK (one command)
bun run packages/sdk/js/script/build.ts

# 3. Frontend uses generated client
import { client } from "@opencode/sdk"
await client.session.prompt({ sessionID: "x", text: "hello" })
```

## 5. Event Bus Publishing

```typescript
// Backend publishes events
import { Bus } from "@/bus/index"

Bus.publish(BusEvent.Type.MessagePartUpdated, {
  sessionID: "ses_123",
  part: { id: "part_456", text: "Hello" }
})
```

## 6. Storage Operations

```typescript
// Write
await Storage.write(["message", sessionID, messageID], messageData)

// Read
const msg = await Storage.read<Message>(["message", sessionID, messageID])

// Update with immer
await Storage.update<Session>(["session", projectID, sessionID], (draft) => {
  draft.title = "New title"
})

// List keys
const keys = await Storage.list(["message", sessionID])
```

## 7. Tool Context Pattern

```typescript
interface ToolContext {
  agent: string           // Current agent name
  messageID: string       // Current message ID
  sessionID: string       // Current session ID
  abort: AbortSignal      // Cancellation signal
  callID: string          // Unique call identifier
  messages: Message[]     // Conversation history
  
  // Methods
  metadata(input): Promise<void>  // Update tool state
  ask(request): Promise<void>     // Request user permission
}
```

## 8. React Store Pattern (Zustand equivalent)

```typescript
// OpenCode uses SolidJS stores, but React equivalent:
const useEventStore = create((set) => ({
  messages: {},
  parts: {},
  addMessage: (sessionId, msg) =>
    set((s) => ({ 
      messages: { ...s.messages, [sessionId]: [...(s.messages[sessionId]||[]), msg] } 
    })),
  updatePart: (msgId, partId, delta) =>
    set((s) => ({ /* update part text */ }))
}))

// Selective subscriptions (prevents re-renders)
function MessageItem({ id }) {
  const message = useEventStore((s) => s.messages[id])
  return <div>{message.text}</div>
}
```

## 9. Monorepo Dev Scripts (Root)

OpenCode runs package dev scripts from root using `bun --cwd ...` instead of a single "dev:all".

```json
// opencode/package.json
{
  "scripts": {
    "dev": "bun run --cwd packages/opencode --conditions=browser src/index.ts",
    "dev:web": "bun --cwd packages/app dev",
    "dev:desktop": "bun --cwd packages/desktop tauri dev"
  }
}
```

## 10. Turborepo Config Field Name

Turborepo v2 uses `tasks` (not `pipeline`). If you copy older configs, `pipeline` will error.

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": {},
    "lint": {}
  }
}
```

## 11. shadcn/ui In a Shared Package (Vite + Tailwind v4)

If shadcn components live in a workspace package (e.g. `packages/ui`) and the app (e.g. `packages/web`) consumes them:

```css
/* packages/ui/src/index.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* CRITICAL (Tailwind v4): ensure utilities used in ui package are generated */
@source "./**/*.{ts,tsx}";
```

And the web app should import UI styles:

```css
/* packages/web/src/index.css */
@import "@buddy/ui/styles";
```

### Aliases

shadcn defaults to `@/lib/utils` and `@/components/ui/*` in generated components. In a shared package, you can either:

- Keep shadcn defaults in `packages/ui/components.json` and teach the consumer bundler to resolve `@/` when bundling UI source.
- Or customize `components.json` aliases to package imports (more portable, but deviates from upstream shadcn defaults).
