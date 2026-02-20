import type { ReactNode } from "react"
import { SidebarProject } from "./sidebar-project"

type SidebarShellProps = {
  projects: string[]
  currentDirectory?: string
  sidebarOpen: boolean
  onSelectProject: (directory: string) => void
  onOpenProject: () => void
  panel: ReactNode
  content: ReactNode
}

export function SidebarShell(props: SidebarShellProps) {
  return (
    <div className="h-screen w-full overflow-hidden bg-card flex flex-col md:flex-row">
      <SidebarProject
        projects={props.projects}
        currentDirectory={props.currentDirectory}
        onSelectProject={props.onSelectProject}
        onOpenProject={props.onOpenProject}
      />
      {props.sidebarOpen ? props.panel : null}
      {props.content}
    </div>
  )
}
