import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type {
  DirectoryChatState,
  MessageInfo,
  MessagePart,
  MessageWithParts,
  SessionInfo,
} from "./chat-types"
import { appendPartDelta, inferBusyFromMessages, upsertMessage, upsertPart } from "./chat-reducer"

type StreamStatus = "idle" | "connecting" | "connected" | "error"

type ChatStore = {
  projects: string[]
  activeDirectory?: string
  lastSessionByDirectory: Record<string, string>
  directories: Record<string, DirectoryChatState>
  streamStatus: StreamStatus
  ensureProject: (directory: string) => void
  removeProject: (directory: string) => void
  setActiveDirectory: (directory: string) => void
  setDirectoryReady: (directory: string, ready: boolean) => void
  setDirectoryError: (directory: string, error?: string) => void
  clearDirectoryError: (directory: string) => void
  setSessions: (directory: string, sessions: SessionInfo[]) => void
  setActiveSession: (directory: string, sessionID: string) => void
  setSessionInfo: (directory: string, info: SessionInfo) => void
  setMessages: (directory: string, sessionID: string, messages: MessageWithParts[]) => void
  applySessionUpdated: (directory: string, info: SessionInfo) => void
  applySessionStatus: (directory: string, sessionID: string, status: "busy" | "idle") => void
  applyMessageUpdated: (directory: string, info: MessageInfo) => void
  applyPartUpdated: (directory: string, part: MessagePart) => void
  applyPartDelta: (
    directory: string,
    input: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
  ) => void
  setStreamStatus: (status: StreamStatus) => void
}

const DEFAULT_TITLE = "New chat"

function emptyDirectoryState(): DirectoryChatState {
  return {
    sessionTitle: DEFAULT_TITLE,
    sessions: [],
    sessionStatusByID: {},
    messages: [],
    isBusy: false,
    isReady: false,
  }
}

function ensureDirectoryState(store: ChatStore, directory: string) {
  return store.directories[directory] ?? emptyDirectoryState()
}

function sortSessions(sessions: SessionInfo[]) {
  return sessions
    .slice()
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
}

function upsertSession(sessions: SessionInfo[], incoming: SessionInfo) {
  const index = sessions.findIndex((session) => session.id === incoming.id)
  if (index === -1) {
    return sortSessions([...sessions, incoming])
  }

  const next = sessions.slice()
  next[index] = incoming
  return sortSessions(next)
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeDirectory: undefined,
      lastSessionByDirectory: {},
      directories: {},
      streamStatus: "idle",
      ensureProject(directory) {
        set((state) => {
          const projects = state.projects.includes(directory)
            ? state.projects
            : [...state.projects, directory]
          return {
            projects,
            directories: {
              ...state.directories,
              [directory]: ensureDirectoryState(state as ChatStore, directory),
            },
          }
        })
      },
      removeProject(directory) {
        set((state) => {
          const projects = state.projects.filter((entry) => entry !== directory)
          const directories = { ...state.directories }
          delete directories[directory]

          const nextLastSession = { ...state.lastSessionByDirectory }
          delete nextLastSession[directory]

          const nextActive =
            state.activeDirectory === directory
              ? projects[0]
              : state.activeDirectory

          return {
            projects,
            directories,
            activeDirectory: nextActive,
            lastSessionByDirectory: nextLastSession,
          }
        })
      },
      setActiveDirectory(directory) {
        set((state) => ({
          activeDirectory: directory,
          directories: {
            ...state.directories,
            [directory]: ensureDirectoryState(state as ChatStore, directory),
          },
        }))
      },
      setDirectoryReady(directory, ready) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              isReady: ready,
            },
          },
        }))
      },
      setDirectoryError(directory, error) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              error,
            },
          },
        }))
      },
      clearDirectoryError(directory) {
        const state = get()
        state.setDirectoryError(directory, undefined)
      },
      setSessions(directory, sessions) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const sortedSessions = sortSessions(sessions)
          const activeSessionID =
            current.sessionID && sortedSessions.some((session) => session.id === current.sessionID)
              ? current.sessionID
              : sortedSessions[0]?.id

          const activeInfo = activeSessionID
            ? sortedSessions.find((session) => session.id === activeSessionID)
            : undefined

          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessions: sortedSessions,
                sessionID: activeSessionID,
                sessionTitle: activeInfo?.title ?? current.sessionTitle,
              },
            },
            lastSessionByDirectory: activeSessionID
              ? {
                  ...state.lastSessionByDirectory,
                  [directory]: activeSessionID,
                }
              : state.lastSessionByDirectory,
          }
        })
      },
      setActiveSession(directory, sessionID) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const activeInfo = current.sessions.find((session) => session.id === sessionID)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessionID,
                sessionTitle: activeInfo?.title ?? current.sessionTitle,
                isBusy: current.sessionStatusByID[sessionID] === "busy",
              },
            },
            lastSessionByDirectory: {
              ...state.lastSessionByDirectory,
              [directory]: sessionID,
            },
          }
        })
      },
      setSessionInfo(directory, info) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const nextSessions = upsertSession(current.sessions, info)
          return {
            lastSessionByDirectory: {
              ...state.lastSessionByDirectory,
              [directory]: info.id,
            },
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessions: nextSessions,
                sessionID: info.id,
                sessionTitle: info.title || DEFAULT_TITLE,
                isBusy: current.sessionStatusByID[info.id] === "busy",
              },
            },
          }
        })
      },
      setMessages(directory, sessionID, messages) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== sessionID) {
            return state
          }

          const nextSessionID = current.sessionID ?? sessionID
          const activeInfo = current.sessions.find((session) => session.id === nextSessionID)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessionID: nextSessionID,
                sessionTitle: activeInfo?.title ?? current.sessionTitle,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [nextSessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      applySessionUpdated(directory, info) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const nextSessions = upsertSession(current.sessions, info)
          const isActive = current.sessionID === info.id
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessions: nextSessions,
                sessionTitle: isActive ? info.title || DEFAULT_TITLE : current.sessionTitle,
              },
            },
          }
        })
      },
      applySessionStatus(directory, sessionID, status) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [sessionID]: status,
                },
                isBusy: current.sessionID === sessionID ? status === "busy" : current.isBusy,
              },
            },
          }
        })
      },
      applyMessageUpdated(directory, info) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== info.sessionID) {
            return state
          }
          const messages = upsertMessage(current.messages, info)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [info.sessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      applyPartUpdated(directory, part) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== part.sessionID) {
            return state
          }
          const messages = upsertPart(current.messages, part)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [part.sessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      applyPartDelta(directory, input) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== input.sessionID) {
            return state
          }
          const messages = appendPartDelta(current.messages, input)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [input.sessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      setStreamStatus(status) {
        set({ streamStatus: status })
      },
    }),
    {
      name: "buddy.chat.v2",
      storage: createJSONStorage(() => localStorage),
      partialize(state) {
        return {
          projects: state.projects,
          activeDirectory: state.activeDirectory,
          lastSessionByDirectory: state.lastSessionByDirectory,
        }
      },
    },
  ),
)
