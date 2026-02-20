import { createBuddyClient } from "@buddy/sdk"
import { useChatStore } from "./chat-store"
import type { MessageWithParts, SessionInfo } from "./chat-types"

const POST_PROMPT_RESYNC_INTERVAL_MS = 350
const POST_PROMPT_RESYNC_ATTEMPTS = 24

function clientFor(directory: string) {
  return createBuddyClient({ directory })
}

function directoryHeaderValue(directory: string) {
  const isNonASCII = /[^\x00-\x7F]/.test(directory)
  return isNonASCII ? encodeURIComponent(directory) : directory
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function unwrap<T>(promise: Promise<{ data?: T; error?: unknown }>) {
  const result = await promise
  if (result.error) {
    const error = result.error as
      | string
      | Error
      | { error?: string; message?: string }
      | undefined

    if (typeof error === "string") {
      throw new Error(error)
    }
    if (error instanceof Error) {
      throw error
    }

    const message = error?.error ?? error?.message
    throw new Error(message ?? JSON.stringify(result.error))
  }
  if (result.data === undefined) {
    throw new Error("Empty response")
  }
  return result.data
}

async function requestJson<T>(directory: string, endpoint: string) {
  const response = await fetch(endpoint, {
    headers: {
      "x-buddy-directory": directoryHeaderValue(directory),
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: string; message?: string }
      | undefined
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as T
}

export async function loadSessions(directory: string) {
  const store = useChatStore.getState()
  try {
    const query = new URLSearchParams({ directory })
    const sessions = await requestJson<SessionInfo[]>(directory, `/api/session?${query.toString()}`)
    store.setSessions(directory, sessions)
    store.setDirectoryError(directory, undefined)
    return sessions
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadMessages(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  try {
    const sdk = clientFor(directory)
    const messages = await unwrap<MessageWithParts[]>(sdk.session.messages({ sessionID }))
    store.setMessages(directory, sessionID, messages)
    store.setDirectoryError(directory, undefined)
    return messages
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

async function createSession(directory: string) {
  const store = useChatStore.getState()
  const sdk = clientFor(directory)
  const info = await unwrap<SessionInfo>(sdk.session.create())
  store.setSessionInfo(directory, info)
  store.setMessages(directory, info.id, [])
  return info
}

export async function ensureDirectorySession(directory: string) {
  const store = useChatStore.getState()
  store.ensureProject(directory)
  store.setDirectoryReady(directory, false)
  store.clearDirectoryError(directory)

  const current = store.directories[directory]
  const storedSession = current?.sessionID ?? store.lastSessionByDirectory[directory]

  try {
    const sessions = await loadSessions(directory)
    const sessionByID = new Map(sessions.map((session) => [session.id, session]))

    let info: SessionInfo | undefined
    if (storedSession && sessionByID.has(storedSession)) {
      info = sessionByID.get(storedSession)
    }

    if (!info) {
      info = sessions[0]
    }

    if (!info && storedSession) {
      const sdk = clientFor(directory)
      info = await unwrap<SessionInfo>(sdk.session.get({ sessionID: storedSession })).catch(() => undefined)
    }

    if (!info) {
      info = await createSession(directory)
      void loadSessions(directory).catch(() => undefined)
    } else {
      store.setSessionInfo(directory, info)
    }

    await loadMessages(directory, info.id)
    store.setDirectoryReady(directory, true)
    return info
  } catch (error) {
    store.setDirectoryReady(directory, true)
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function selectSession(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  const current = store.directories[directory]
  const existing = current?.sessions.find((session) => session.id === sessionID)

  if (existing) {
    store.setSessionInfo(directory, existing)
  } else {
    const sdk = clientFor(directory)
    const info = await unwrap<SessionInfo>(sdk.session.get({ sessionID }))
    store.setSessionInfo(directory, info)
  }

  await loadMessages(directory, sessionID)
}

export async function startNewSession(directory: string) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  const info = await createSession(directory)
  void loadSessions(directory).catch(() => undefined)
  await loadMessages(directory, info.id)
  return info
}

export async function sendPrompt(directory: string, content: string) {
  const store = useChatStore.getState()
  const state = store.directories[directory]
  const sessionID = state?.sessionID
  if (!sessionID) {
    throw new Error("No session available")
  }

  const sdk = clientFor(directory)
  store.clearDirectoryError(directory)
  try {
    console.info("[chat-action] prompt.start", {
      directory,
      contentLength: content.length,
      sessionID,
    })
    await unwrap<MessageWithParts>(
      sdk.session.prompt({
        sessionID,
        content,
      }),
    )
    console.info("[chat-action] prompt.accepted", { directory, sessionID })
    store.applySessionStatus(directory, sessionID, "busy")
    void pollPromptCompletion(directory, sessionID)
  } catch (error) {
    console.error("[chat-action] prompt.failed", {
      directory,
      sessionID,
      error: stringifyError(error),
    })
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function abortPrompt(directory: string) {
  const store = useChatStore.getState()
  const state = store.directories[directory]
  const sessionID = state?.sessionID
  if (!sessionID) {
    return false
  }

  const sdk = clientFor(directory)
  try {
    const aborted = await unwrap<boolean>(sdk.session.abort({ sessionID }))
    if (aborted) {
      store.applySessionStatus(directory, sessionID, "idle")
    }
    return aborted
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function resyncDirectory(directory: string) {
  const store = useChatStore.getState()
  const sessionID = store.directories[directory]?.sessionID
  await loadSessions(directory)
  if (!sessionID) return
  await loadMessages(directory, sessionID)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function pollPromptCompletion(directory: string, sessionID: string) {
  for (let attempt = 1; attempt <= POST_PROMPT_RESYNC_ATTEMPTS; attempt += 1) {
    await sleep(POST_PROMPT_RESYNC_INTERVAL_MS)
    const snapshot = useChatStore.getState().directories[directory]
    if (!snapshot) return
    if (snapshot.sessionID !== sessionID) return

    try {
      await loadMessages(directory, sessionID)
    } catch (error) {
      console.warn("[chat-action] prompt.resync.failed", {
        directory,
        sessionID,
        attempt,
        error: stringifyError(error),
      })
      continue
    }

    const next = useChatStore.getState().directories[directory]
    if (!next) return
    if (next.sessionID !== sessionID) return
    if (!next.isBusy) {
      console.info("[chat-action] prompt.resync.completed", {
        directory,
        sessionID,
        attempt,
      })
      void loadSessions(directory).catch(() => undefined)
      return
    }
  }

  console.warn("[chat-action] prompt.resync.timeout", {
    directory,
    sessionID,
    attempts: POST_PROMPT_RESYNC_ATTEMPTS,
  })
}
