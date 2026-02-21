import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState, type UIEvent } from "react"
import { Button } from "@buddy/ui"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/chat/permission-dock"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import { LayoutLeftIcon, LayoutLeftPartialIcon } from "@/components/layout/sidebar-icons"
import { SidebarShell } from "@/components/layout/sidebar-shell"
import { SidebarWorkspace } from "@/components/layout/sidebar-workspace"
import { pickProjectDirectory } from "../lib/directory-picker"
import { decodeDirectory, encodeDirectory } from "../lib/directory-token"
import {
  abortPrompt,
  ensureDirectorySession,
  replyPermission,
  resyncDirectory,
  selectSession,
  sendPrompt,
  startNewSession,
} from "../state/chat-actions"
import { useChatStore } from "../state/chat-store"
import { startChatSync } from "../state/chat-sync"
import type { GlobalEvent, MessageInfo, MessagePart, SessionInfo } from "../state/chat-types"

export const Route = createFileRoute("/$directory/chat")({
  component: DirectoryChatPage,
})

const BOTTOM_THRESHOLD_PX = 96

async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function buildSessionTrace(input: {
  directory: string
  sessionID?: string
  streamStatus: string
}) {
  const state = useChatStore.getState()
  const directoryState = state.directories[input.directory]
  const session = directoryState?.sessions.find((entry) => entry.id === input.sessionID)

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: input.sessionID,
      streamStatus: input.streamStatus,
      session,
      directoryState: directoryState
        ? {
            sessionTitle: directoryState.sessionTitle,
            sessionStatusByID: directoryState.sessionStatusByID,
            isBusy: directoryState.isBusy,
            isReady: directoryState.isReady,
            error: directoryState.error,
            pendingPermissions: directoryState.pendingPermissions,
            sessions: directoryState.sessions,
            messages: directoryState.messages,
          }
        : undefined,
      projects: state.projects,
      activeDirectory: state.activeDirectory,
      lastSessionByDirectory: state.lastSessionByDirectory,
    },
    null,
    2,
  )
}

function DirectoryChatPage() {
  const params = Route.useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
  const transcriptRef = useRef<HTMLElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("buddy.sidebar.open") !== "0"
  })

  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(params.directory)
    } catch {
      return ""
    }
  }, [params.directory])

  const projects = useChatStore((state) => state.projects)
  const streamStatus = useChatStore((state) => state.streamStatus)
  const directoryState = useChatStore((state) =>
    decodedDirectory ? state.directories[decodedDirectory] : undefined,
  )
  const ensureProject = useChatStore((state) => state.ensureProject)
  const removeProject = useChatStore((state) => state.removeProject)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setStreamStatus = useChatStore((state) => state.setStreamStatus)
  const applySessionUpdated = useChatStore((state) => state.applySessionUpdated)
  const applySessionStatus = useChatStore((state) => state.applySessionStatus)
  const applyMessageUpdated = useChatStore((state) => state.applyMessageUpdated)
  const applyPartUpdated = useChatStore((state) => state.applyPartUpdated)
  const applyPartDelta = useChatStore((state) => state.applyPartDelta)
  const applyPermissionAsked = useChatStore((state) => state.applyPermissionAsked)
  const applyPermissionReplied = useChatStore((state) => state.applyPermissionReplied)

  useEffect(() => {
    if (!decodedDirectory) return

    ensureProject(decodedDirectory)
    setActiveDirectory(decodedDirectory)
    void ensureDirectorySession(decodedDirectory)
  }, [decodedDirectory, ensureProject, setActiveDirectory])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem("buddy.sidebar.open", sidebarOpen ? "1" : "0")
  }, [sidebarOpen])

  useEffect(() => {
    if (!decodedDirectory) return

    const sync = startChatSync({
      directory: decodedDirectory,
      onStatus(status) {
        setStreamStatus(status)
      },
      onOpen() {
        const knownProjects = useChatStore.getState().projects
        for (const directory of knownProjects) {
          void resyncDirectory(directory)
        }
      },
      onEvent(event: GlobalEvent) {
        const directory = event.directory
        if (!directory || directory === "global") {
          if (event.payload.type === "server.connected") {
            const knownProjects = useChatStore.getState().projects
            for (const projectDirectory of knownProjects) {
              void resyncDirectory(projectDirectory)
            }
          }
          return
        }

        const payload = event.payload
        const properties = payload.properties

        if (payload.type === "session.created" || payload.type === "session.updated") {
          applySessionUpdated(directory, properties.info as SessionInfo)
          return
        }

        if (payload.type === "session.status") {
          applySessionStatus(
            directory,
            String(properties.sessionID ?? ""),
            (properties.status as "busy" | "idle") ?? "idle",
          )
          return
        }

        if (payload.type === "message.updated") {
          applyMessageUpdated(directory, properties.info as MessageInfo)
          return
        }

        if (payload.type === "message.part.updated") {
          applyPartUpdated(directory, properties.part as MessagePart)
          return
        }

        if (payload.type === "message.part.delta") {
          applyPartDelta(directory, {
            sessionID: String(properties.sessionID ?? ""),
            messageID: String(properties.messageID ?? ""),
            partID: String(properties.partID ?? ""),
            field: String(properties.field ?? ""),
            delta: String(properties.delta ?? ""),
          })
          return
        }

        if (payload.type === "permission.asked") {
          applyPermissionAsked(directory, properties as any)
          return
        }

        if (payload.type === "permission.replied") {
          applyPermissionReplied(directory, String(properties.requestID ?? ""))
        }
      },
    })

    return () => {
      sync.stop()
      setStreamStatus("idle")
    }
  }, [
    decodedDirectory,
    applyMessageUpdated,
    applyPermissionAsked,
    applyPermissionReplied,
    applyPartDelta,
    applyPartUpdated,
    applySessionStatus,
    applySessionUpdated,
    setStreamStatus,
  ])

  const sessionID = directoryState?.sessionID
  const sessions = directoryState?.sessions ?? []
  const sessionTitle =
    sessions.find((session) => session.id === sessionID)?.title ?? directoryState?.sessionTitle ?? "New chat"
  const messages = directoryState?.messages ?? []
  const isBusy = directoryState?.isBusy ?? false
  const isReady = directoryState?.isReady ?? false
  const error = directoryState?.error
  const sessionStatusByID = directoryState?.sessionStatusByID ?? {}
  const pendingPermissions = directoryState?.pendingPermissions ?? []
  const showDevSessionTrace = import.meta.env.DEV

  useEffect(() => {
    setStickToBottom(true)
  }, [sessionID])

  useEffect(() => {
    if (!stickToBottom) return
    const container = transcriptRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto",
    })
  }, [messages, isBusy, stickToBottom])

  function onTranscriptScroll(event: UIEvent<HTMLElement>) {
    const node = event.currentTarget
    const distanceFromBottom = node.scrollHeight - (node.scrollTop + node.clientHeight)
    setStickToBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
  }

  async function onSend() {
    if (!decodedDirectory) return
    const content = draft.trim()
    if (!content) return

    setDraft("")
    try {
      await sendPrompt(decodedDirectory, content)
    } catch {
      setDraft(content)
    }
  }

  async function onAbort() {
    if (!decodedDirectory) return
    await abortPrompt(decodedDirectory)
  }

  async function onNewSession() {
    if (!decodedDirectory) return
    try {
      await startNewSession(decodedDirectory)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onSelectSession(nextSessionID: string) {
    if (!decodedDirectory) return
    if (!nextSessionID || nextSessionID === sessionID) return
    try {
      await selectSession(decodedDirectory, nextSessionID)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onPermissionReply(requestID: string, reply: "once" | "always" | "reject") {
    if (!decodedDirectory) return
    try {
      await replyPermission({
        directory: decodedDirectory,
        requestID,
        reply,
      })
    } catch {
      // store error is handled by action callers elsewhere; keep UI non-blocking here
    }
  }

  function onSwitchDirectory(nextDirectory: string) {
    if (!nextDirectory) return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(nextDirectory) },
    })
  }

  async function onOpenProject() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return

      ensureProject(picked)
      setActiveDirectory(picked)
      onSwitchDirectory(picked)
    } catch {
      // keep current screen state if user cancels/inputs invalid path in fallback prompt
    }
  }

  function onRemoveProject(directory: string) {
    const remaining = projects.filter((entry) => entry !== directory)
    removeProject(directory)

    if (directory !== decodedDirectory) return

    if (remaining.length > 0) {
      onSwitchDirectory(remaining[0])
      return
    }

    navigate({ to: "/chat" })
  }

  if (!decodedDirectory) {
    return <div className="p-6">Invalid project identifier in URL.</div>
  }

  return (
    <SidebarShell
      projects={projects}
      currentDirectory={decodedDirectory}
      sidebarOpen={sidebarOpen}
      onSelectProject={onSwitchDirectory}
      onOpenProject={() => {
        void onOpenProject()
      }}
      panel={
        <SidebarWorkspace
          directory={decodedDirectory}
          sessions={sessions}
          activeSessionID={sessionID}
          sessionStatusByID={sessionStatusByID}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onRemoveProject={() => onRemoveProject(decodedDirectory)}
        />
      }
      content={
        <main className="flex-1 min-h-0 flex flex-col bg-background/20">
          <header className="px-4 py-3 border-b flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSidebarOpen((value) => !value)}
                title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? (
                  <LayoutLeftPartialIcon className="size-3.5" />
                ) : (
                  <LayoutLeftIcon className="size-3.5" />
                )}
              </Button>
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-medium truncate">{sessionTitle}</h1>
                <p className="text-xs text-muted-foreground truncate">{sessionID ?? "No active session"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showDevSessionTrace && sessionID && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void copyToClipboard(
                      buildSessionTrace({
                        directory: decodedDirectory,
                        sessionID,
                        streamStatus,
                      }),
                    )
                  }}
                >
                  Copy Trace
                </Button>
              )}
              <span className="text-xs text-muted-foreground hidden md:inline">SSE: {streamStatus}</span>
            </div>
          </header>

          <section
            ref={transcriptRef}
            onScroll={onTranscriptScroll}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
          >
            {!isReady ? (
              <p className="text-sm text-muted-foreground">Loading project chat...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Start the conversation.</p>
            ) : (
              <ChatTranscript
                messages={messages}
                isBusy={isBusy}
                onOpenSession={(targetSessionID) => {
                  void onSelectSession(targetSessionID)
                }}
              />
            )}
          </section>

          {error && (
            <div className="mx-4 mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {pendingPermissions.length > 0 && (
            <div className="mx-4 mb-3">
              <PermissionDock
                request={pendingPermissions[0]!}
                pendingCount={Math.max(0, pendingPermissions.length - 1)}
                onReply={async (reply) => {
                  await onPermissionReply(pendingPermissions[0]!.id, reply)
                }}
              />
            </div>
          )}

          <PromptComposer
            value={draft}
            isBusy={isBusy}
            onChange={setDraft}
            onAbort={() => {
              void onAbort()
            }}
            onSubmit={() => {
              void onSend()
            }}
          />
        </main>
      }
    />
  )
}
