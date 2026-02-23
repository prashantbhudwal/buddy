import { useMemo, useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  NativeSelect,
  NativeSelectOption,
} from "@buddy/ui"
import type { SessionInfo } from "@/state/chat-types"
import { getFilename, relativeTime } from "./sidebar-helpers"
import {
  ArchiveIcon,
  BookOpenIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SettingsIcon,
} from "./sidebar-icons"

type ChatLeftSidebarProps = {
  directories: string[]
  currentDirectory: string
  sessions: SessionInfo[]
  activeSessionID?: string
  sessionStatusByID: Record<string, "busy" | "idle">
  pinnedSessionIDs: string[]
  unreadSessionIDs: string[]
  onSelectDirectory: (directory: string) => void
  onOpenDirectory: () => void
  onNewSession: () => void
  onSelectSession: (sessionID: string) => void
  onTogglePin: (sessionID: string) => void
  onToggleUnread: (sessionID: string, unread: boolean) => void
  onArchiveSession: (sessionID: string) => Promise<void>
  onRenameSession: (sessionID: string, title: string) => Promise<void>
  onOpenCurriculum: () => void
  onOpenSettings: () => void
  onCloseDirectory: () => void
}

type RenameState = {
  sessionID: string
  title: string
}

export function ChatLeftSidebar(props: ChatLeftSidebarProps) {
  const pinnedSet = useMemo(() => new Set(props.pinnedSessionIDs), [props.pinnedSessionIDs])
  const unreadSet = useMemo(() => new Set(props.unreadSessionIDs), [props.unreadSessionIDs])

  const sessions = useMemo(() => {
    const pinned: SessionInfo[] = []
    const rest: SessionInfo[] = []

    for (const session of props.sessions) {
      if (pinnedSet.has(session.id)) {
        pinned.push(session)
        continue
      }
      rest.push(session)
    }

    return [...pinned, ...rest]
  }, [props.sessions, pinnedSet])

  const [renameState, setRenameState] = useState<RenameState | undefined>(undefined)
  const [renameSaving, setRenameSaving] = useState(false)

  const directoryLabel = getFilename(props.currentDirectory)

  async function submitRename() {
    if (!renameState) return
    const nextTitle = renameState.title.trim()
    if (!nextTitle) return

    setRenameSaving(true)
    try {
      await props.onRenameSession(renameState.sessionID, nextTitle)
      setRenameState(undefined)
    } finally {
      setRenameSaving(false)
    }
  }

  return (
    <aside className="w-[320px] shrink-0 border-r bg-card/50 flex flex-col min-h-0">
      <header className="border-b px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Notebook</p>
            <p className="text-sm font-medium truncate">{directoryLabel}</p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={props.onOpenDirectory} title="Open notebook">
            <FolderIcon className="size-3.5" />
          </Button>
        </div>

        <NativeSelect
          value={props.currentDirectory}
          onChange={(event) => props.onSelectDirectory(event.target.value)}
          className="w-full"
          aria-label="Select notebook"
        >
          {props.directories.map((directory) => (
            <NativeSelectOption key={directory} value={directory}>
              local: {getFilename(directory)}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={props.onNewSession}>
          <PlusIcon className="size-3.5 mr-2" />
          New chat
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {sessions.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">No threads yet.</p>
        ) : (
          sessions.map((session) => {
            const active = session.id === props.activeSessionID
            const busy = props.sessionStatusByID[session.id] === "busy"
            const pinned = pinnedSet.has(session.id)
            const unread = unreadSet.has(session.id)
            const timeLabel = relativeTime(session.time.updated ?? session.time.created)

            return (
              <div
                key={session.id}
                className={`group/thread relative rounded-md border ${
                  active
                    ? "bg-muted border-border"
                    : "border-transparent hover:bg-muted/40 hover:border-border/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => props.onSelectSession(session.id)}
                  className="w-full px-2 py-1.5 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-7">
                    <span
                      className={`inline-block size-1.5 rounded-full shrink-0 ${
                        busy ? "bg-amber-500" : unread ? "bg-sky-500" : "bg-emerald-500"
                      }`}
                    />
                    <span className="text-sm truncate">{session.title || "New chat"}</span>
                    {pinned ? <PinIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{timeLabel}</span>
                    {unread ? <span>Unread</span> : null}
                  </div>
                </button>

                <div className="absolute right-1 top-1.5 opacity-0 pointer-events-none transition-opacity group-hover/thread:opacity-100 group-hover/thread:pointer-events-auto group-focus-within/thread:opacity-100 group-focus-within/thread:pointer-events-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        aria-label="Thread options"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <EllipsisHorizontalIcon className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onSelect={() => {
                          props.onTogglePin(session.id)
                        }}
                      >
                        <PinIcon className="size-3.5 mr-2" />
                        {pinned ? "Unpin thread" : "Pin thread"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenameState({
                            sessionID: session.id,
                            title: session.title,
                          })
                        }}
                      >
                        <PencilIcon className="size-3.5 mr-2" />
                        Rename thread
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          void props.onArchiveSession(session.id)
                        }}
                      >
                        <ArchiveIcon className="size-3.5 mr-2" />
                        Archive thread
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          props.onToggleUnread(session.id, !unread)
                        }}
                      >
                        {unread ? "Mark as read" : "Mark as unread"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })
        )}
      </div>

      <footer className="border-t px-2 py-2 space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={props.onOpenCurriculum}>
          <BookOpenIcon className="size-3.5 mr-2" />
          Curriculum
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={props.onOpenSettings}>
          <SettingsIcon className="size-3.5 mr-2" />
          Settings
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={props.onCloseDirectory}>
          Close notebook
        </Button>
      </footer>

      <Dialog
        open={!!renameState}
        onOpenChange={(open) => {
          if (!open) setRenameState(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>Use a short, meaningful title.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameState?.title ?? ""}
            onChange={(event) =>
              setRenameState((current) =>
                current
                  ? {
                      ...current,
                      title: event.target.value,
                    }
                  : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void submitRename()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameState(undefined)}>
              Cancel
            </Button>
            <Button disabled={renameSaving || !renameState?.title.trim()} onClick={() => void submitRename()}>
              {renameSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
