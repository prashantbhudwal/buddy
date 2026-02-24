export type SessionInfo = {
  id: string
  title: string
  time: {
    created: number
    updated: number
    archived?: number
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

export type MessageError = {
  name: string
  message: string
  [key: string]: unknown
}

export type MessageOutputFormat =
  | {
      type: "text"
    }
  | {
      type: "json_schema"
      schema: Record<string, unknown>
      retryCount?: number
    }

export type UserMessageInfo = {
  id: string
  sessionID: string
  role: "user"
  agent: string
  model: MessageModel
  variant?: string
  tools?: Record<string, boolean>
  format?: MessageOutputFormat
  system?: string
  time: MessageTime
}

export type AssistantMessageInfo = {
  id: string
  sessionID: string
  role: "assistant"
  parentID: string
  providerID: string
  modelID: string
  mode: string
  agent: string
  path: {
    cwd: string
    root: string
  }
  variant?: string
  structured?: unknown
  summary?: boolean
  time: MessageTime
  error?: MessageError
  finish?: string
  tokens: {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  cost: number
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

export type ProviderModelInfo = {
  id: string
  providerID: string
  name: string
  family?: string
  api: {
    id: string
    npm?: string
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  modalities?: {
    input: string[]
    output: string[]
  }
  reasoning: boolean
  options: Record<string, unknown>
  variants?: Record<string, Record<string, unknown>>
}

export type ProviderInfo = {
  id: string
  name: string
  npm?: string
  api?: string
  env: string[]
  models: ProviderModelInfo[]
}

export type ConfigProvidersResponse = {
  providers: ProviderInfo[]
  default: Record<string, string>
}

export type DirectoryChatState = {
  sessionID?: string
  sessionTitle: string
  sessions: SessionInfo[]
  sessionStatusByID: Record<string, "busy" | "idle">
  messages: MessageWithParts[]
  pendingPermissions: PermissionRequest[]
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  isBusy: boolean
  isReady: boolean
  error?: string
}
