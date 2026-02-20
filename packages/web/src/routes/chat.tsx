import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { Button, Input } from "@buddy/ui"
import { encodeDirectory } from "../lib/directory-token"
import { useChatStore } from "../state/chat-store"

export const Route = createFileRoute("/chat")({
  component: ChatEntryPage,
})

function ChatEntryPage() {
  const navigate = useNavigate()
  const projects = useChatStore((state) => state.projects)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const ensureProject = useChatStore((state) => state.ensureProject)
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const [directory, setDirectory] = useState("")

  const recents = useMemo(() => {
    if (!activeDirectory) return projects
    return [activeDirectory, ...projects.filter((item) => item !== activeDirectory)]
  }, [activeDirectory, projects])

  function openDirectory(value: string) {
    const directory = value.trim()
    if (!directory) return
    ensureProject(directory)
    setActiveDirectory(directory)
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(directory) },
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Buddy</p>
        <h1 className="text-3xl font-semibold">Open project</h1>
        <p className="text-sm text-muted-foreground">OpenCode-style project and session workflow for Buddy.</p>
      </div>

      <form
        className="mt-8 rounded-xl border bg-card p-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          openDirectory(directory)
        }}
      >
        <Input
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          placeholder="/absolute/path/to/repository"
        />
        <Button type="submit">Open</Button>
      </form>

      {recents.length > 0 ? (
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Recent projects</p>
          </div>
          <div className="space-y-2">
            {recents.map((project) => (
              <button
                key={project}
                type="button"
                className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                onClick={() => openDirectory(project)}
              >
                {project}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-12 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No projects yet. Open a repository directory to start.
        </div>
      )}
    </div>
  )
}
