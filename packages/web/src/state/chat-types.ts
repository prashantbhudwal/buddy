export type SessionInfo = {
  id: string
  title: string
  time: {
    created: number
    updated: number
  }
}

export type MessageInfo = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  finish?: string
}

export type MessagePart = {
  id: string
  sessionID: string
  messageID: string
  type: string
  [key: string]: unknown
}

export type MessageWithParts = {
  info: MessageInfo
  parts: MessagePart[]
}

export type GlobalEvent = {
  directory?: string
  payload: {
    type: string
    properties: Record<string, unknown>
  }
}

export type DirectoryChatState = {
  sessionID?: string
  sessionTitle: string
  sessions: SessionInfo[]
  sessionStatusByID: Record<string, "busy" | "idle">
  messages: MessageWithParts[]
  isBusy: boolean
  isReady: boolean
  error?: string
}
