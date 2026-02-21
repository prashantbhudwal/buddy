export type SessionInfo = {
  id: string
  title: string
  time: {
    created: number
    updated: number
  }
}

type MessageTime = {
  created: number
  completed?: number
}

type MessageModel = {
  providerID: string
  modelID: string
}

export type UserMessageInfo = {
  id: string
  sessionID: string
  role: "user"
  agent?: string
  model?: MessageModel
  system?: string
  time: MessageTime
}

export type AssistantMessageInfo = {
  id: string
  sessionID: string
  role: "assistant"
  agent?: string
  time: MessageTime
  error?: string
  finish?: string
  tokens?: {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  cost?: number
}

export type MessageInfo = UserMessageInfo | AssistantMessageInfo

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

export type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: {
    messageID: string
    callID: string
  }
}

export type DirectoryChatState = {
  sessionID?: string
  sessionTitle: string
  sessions: SessionInfo[]
  sessionStatusByID: Record<string, "busy" | "idle">
  messages: MessageWithParts[]
  pendingPermissions: PermissionRequest[]
  isBusy: boolean
  isReady: boolean
  error?: string
}
