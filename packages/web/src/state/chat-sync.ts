import type { GlobalEvent } from "./chat-types"

type SyncHandlers = {
  directory?: string
  onOpen?: () => void
  onEvent: (event: GlobalEvent) => void
  onError?: (error: unknown) => void
  onStatus?: (status: "connecting" | "connected" | "error") => void
}

const FRAME_MS = 16

function eventKey(event: GlobalEvent) {
  const directory = event.directory ?? "global"
  const payload = event.payload

  if (payload.type === "session.status") {
    return `${directory}:session.status:${String(payload.properties.sessionID ?? "")}`
  }

  if (payload.type === "message.part.updated") {
    const part = payload.properties.part as { messageID?: string; id?: string } | undefined
    if (!part?.messageID || !part.id) return undefined
    return `${directory}:message.part.updated:${part.messageID}:${part.id}`
  }

  return undefined
}

export function startChatSync(handlers: SyncHandlers) {
  let source: EventSource | undefined
  let reconnectTimer: number | undefined
  let attempt = 0
  let disposed = false
  let queue: Array<GlobalEvent | undefined> = []
  const coalesced = new Map<string, number>()
  let flushTimer: number | undefined

  const clearReconnect = () => {
    if (reconnectTimer === undefined) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const closeSource = () => {
    if (!source) return
    source.close()
    source = undefined
  }

  const flush = () => {
    if (flushTimer !== undefined) {
      window.clearTimeout(flushTimer)
      flushTimer = undefined
    }

    if (queue.length === 0) return
    const events = queue
    queue = []
    coalesced.clear()

    for (const event of events) {
      if (!event) continue
      handlers.onEvent(event)
    }
  }

  const scheduleFlush = () => {
    if (flushTimer !== undefined) return
    flushTimer = window.setTimeout(flush, FRAME_MS)
  }

  const connect = () => {
    if (disposed) return
    console.info("[chat-sync] connect")
    handlers.onStatus?.("connecting")
    closeSource()
    clearReconnect()
    const search = new URLSearchParams()
    if (handlers.directory) {
      search.set("directory", handlers.directory)
    }
    const endpoint = search.size > 0 ? `/api/event?${search.toString()}` : "/api/event"
    source = new EventSource(endpoint)

    source.onopen = () => {
      attempt = 0
      console.info("[chat-sync] open")
      handlers.onOpen?.()
      handlers.onStatus?.("connected")
    }

    source.onmessage = (messageEvent) => {
      try {
        const event = JSON.parse(messageEvent.data) as GlobalEvent
        const payloadType = event.payload?.type ?? "unknown"
        if (payloadType === "session.status" || payloadType === "message.updated") {
          console.info("[chat-sync] event", {
            directory: event.directory ?? "global",
            type: payloadType,
            sessionID: String(event.payload?.properties?.sessionID ?? ""),
          })
        }
        const key = eventKey(event)
        if (key) {
          const existing = coalesced.get(key)
          if (existing !== undefined) {
            queue[existing] = event
            return
          }
          coalesced.set(key, queue.length)
        }
        queue.push(event)
        scheduleFlush()
      } catch (error) {
        handlers.onError?.(error)
      }
    }

    source.onerror = () => {
      handlers.onStatus?.("error")
      console.warn("[chat-sync] error", { attempt: attempt + 1 })
      closeSource()
      if (disposed) return
      attempt += 1
      const delay = Math.min(10_000, 500 * attempt)
      reconnectTimer = window.setTimeout(() => {
        connect()
      }, delay)
      handlers.onError?.(new Error(`Event stream disconnected (attempt ${attempt})`))
    }
  }

  connect()

  return {
    stop() {
      disposed = true
      clearReconnect()
      closeSource()
      flush()
    },
  }
}
