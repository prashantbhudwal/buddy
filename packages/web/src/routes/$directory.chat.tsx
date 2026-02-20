import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@buddy/ui"
import { Markdown } from "@/components/Markdown"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import { LayoutLeftIcon, LayoutLeftPartialIcon } from "@/components/layout/sidebar-icons"
import { SidebarShell } from "@/components/layout/sidebar-shell"
import { SidebarWorkspace } from "@/components/layout/sidebar-workspace"
import { pickProjectDirectory } from "../lib/directory-picker"
import { decodeDirectory, encodeDirectory } from "../lib/directory-token"
import {
  abortPrompt,
  ensureDirectorySession,
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

function DirectoryChatPage() {
  const params = Route.useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
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
              <span className="text-xs text-muted-foreground hidden md:inline">SSE: {streamStatus}</span>
            </div>
          </header>

          <section className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {!isReady ? (
              <p className="text-sm text-muted-foreground">Loading project chat...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Start the conversation.</p>
            ) : (
              messages.map((message) => (
                <div key={message.info.id} className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {message.info.role === "user" ? "You" : "Buddy"}
                    {message.info.role === "assistant" && message.info.finish === "aborted" ? " (aborted)" : ""}
                  </div>

                  {message.parts.map((part) => {
                    if (part.type === "text") {
                      return (
                        <div key={part.id} className="rounded-lg border bg-background p-3">
                          <Markdown text={String(part.text ?? "")} />
                        </div>
                      )
                    }

                    if (part.type === "reasoning") {
                      return (
                        <details key={part.id} className="rounded-lg border bg-background p-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground">Reasoning</summary>
                          <div className="pt-3">
                            <Markdown text={String(part.text ?? "")} />
                          </div>
                        </details>
                      )
                    }

                    if (part.type === "tool") {
                      const state = part.state as { status: string; output?: string; error?: string }
                      return (
                        <details key={part.id} className="rounded-lg border bg-background p-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground">
                            Tool: {String(part.tool)} ({state.status})
                          </summary>
                          <pre className="text-xs whitespace-pre-wrap pt-3 text-muted-foreground">
                            {state.output || state.error || "No output"}
                          </pre>
                        </details>
                      )
                    }

                    return null
                  })}
                </div>
              ))
            )}
          </section>

          {error && (
            <div className="mx-4 mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
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
