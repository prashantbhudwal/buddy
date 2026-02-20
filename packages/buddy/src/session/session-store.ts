import { newSessionID } from "./id.js"
import { SessionInfo } from "./session-info.js"
import type { AssistantMessage, MessageInfo, MessagePart, MessageWithParts } from "./message-v2/index.js"
import { Instance } from "../project/instance.js"

type StoredMessage = {
  info: MessageInfo
  parts: MessagePart[]
}

type SessionRecord = {
  info: SessionInfo.Info
  messages: Map<string, StoredMessage>
  order: string[]
  activeAbort?: AbortController
}

const sessions = Instance.state("session.store.sessions", () => new Map<string, SessionRecord>())

export namespace SessionStore {
  export function list(input?: { limit?: number }) {
    const records = Array.from(sessions().values())
      .map((record) => record.info)
      .sort((a, b) => b.time.updated - a.time.updated)

    const limit = input?.limit
    if (!limit || limit <= 0) {
      return records
    }
    return records.slice(0, limit)
  }

  export function create() {
    const scopedSessions = sessions()
    const now = Date.now()
    const info: SessionInfo.Info = {
      id: newSessionID(),
      title: "New chat",
      time: {
        created: now,
        updated: now,
      },
    }
    scopedSessions.set(info.id, {
      info,
      messages: new Map(),
      order: [],
    })
    return info
  }

  export function get(sessionID: string) {
    const record = sessions().get(sessionID)
    if (!record) {
      return undefined
    }
    return record.info
  }

  export function assert(sessionID: string) {
    const record = sessions().get(sessionID)
    if (!record) {
      throw new Error(`Session not found: ${sessionID}`)
    }
    return record
  }

  export function setTitle(sessionID: string, title: string) {
    const record = assert(sessionID)
    record.info = {
      ...record.info,
      title,
      time: {
        ...record.info.time,
        updated: Date.now(),
      },
    }
    return record.info
  }

  export function touch(sessionID: string) {
    const record = assert(sessionID)
    record.info = {
      ...record.info,
      time: {
        ...record.info.time,
        updated: Date.now(),
      },
    }
    return record.info
  }

  export function appendMessage(info: MessageInfo) {
    const record = assert(info.sessionID)
    record.messages.set(info.id, {
      info,
      parts: [],
    })
    record.order.push(info.id)
    touch(info.sessionID)
    return getMessageWithParts(info.sessionID, info.id)
  }

  export function updateMessage(info: MessageInfo) {
    const record = assert(info.sessionID)
    const message = record.messages.get(info.id)
    if (!message) {
      throw new Error(`Message not found: ${info.id}`)
    }
    message.info = info
    touch(info.sessionID)
    return getMessageWithParts(info.sessionID, info.id)
  }

  export function appendPart(part: MessagePart) {
    const record = assert(part.sessionID)
    const message = record.messages.get(part.messageID)
    if (!message) {
      throw new Error(`Message not found: ${part.messageID}`)
    }
    message.parts.push(part)
    touch(part.sessionID)
    return part
  }

  export function updatePart(part: MessagePart) {
    const record = assert(part.sessionID)
    const message = record.messages.get(part.messageID)
    if (!message) {
      throw new Error(`Message not found: ${part.messageID}`)
    }
    const index = message.parts.findIndex((item) => item.id === part.id)
    if (index === -1) {
      message.parts.push(part)
    } else {
      message.parts[index] = part
    }
    touch(part.sessionID)
    return part
  }

  export function updatePartDelta(input: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }) {
    const record = assert(input.sessionID)
    const message = record.messages.get(input.messageID)
    if (!message) {
      throw new Error(`Message not found: ${input.messageID}`)
    }
    const part = message.parts.find((item) => item.id === input.partID)
    if (!part) {
      throw new Error(`Part not found: ${input.partID}`)
    }

    const mutable = part as Record<string, unknown>
    const current = mutable[input.field]
    if (typeof current !== "string") {
      throw new Error(`Part field "${input.field}" is not a string`)
    }
    mutable[input.field] = current + input.delta
    touch(input.sessionID)
    return part
  }

  export function getMessageWithParts(sessionID: string, messageID: string) {
    const record = assert(sessionID)
    const message = record.messages.get(messageID)
    if (!message) {
      return undefined
    }
    return {
      info: message.info,
      parts: [...message.parts],
    } as MessageWithParts
  }

  export function listMessages(sessionID: string) {
    const record = assert(sessionID)
    return record.order
      .map((messageID) => record.messages.get(messageID))
      .filter((item): item is StoredMessage => item !== undefined)
      .map((message) => ({
        info: message.info,
        parts: [...message.parts],
      }))
  }

  export function userMessageCount(sessionID: string) {
    const record = assert(sessionID)
    let count = 0
    for (const message of record.messages.values()) {
      if (message.info.role === "user") {
        count += 1
      }
    }
    return count
  }

  export function setActiveAbort(sessionID: string, controller: AbortController) {
    const record = assert(sessionID)
    record.activeAbort = controller
    touch(sessionID)
  }

  export function clearActiveAbort(sessionID: string) {
    const record = assert(sessionID)
    record.activeAbort = undefined
    touch(sessionID)
  }

  export function isBusy(sessionID: string) {
    const record = assert(sessionID)
    return Boolean(record.activeAbort)
  }

  export function abort(sessionID: string) {
    const record = assert(sessionID)
    if (!record.activeAbort) {
      return false
    }
    record.activeAbort.abort("User aborted")
    return true
  }

  export function getAssistantInfo(sessionID: string, messageID: string) {
    const message = getMessageWithParts(sessionID, messageID)
    if (!message) return undefined
    if (message.info.role !== "assistant") return undefined
    return message.info as AssistantMessage
  }
}
