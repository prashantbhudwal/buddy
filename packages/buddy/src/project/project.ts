import path from "node:path"
import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Database, eq } from "../storage/db.js"
import { ProjectTable } from "./project.sql.js"

type GitProjectResolution = {
  id: string
  sandbox: string
  worktree: string
  vcs?: "git"
}

export namespace Project {
  export type Info = {
    id: string
    worktree: string
    vcs?: "git"
    name?: string
    icon?: {
      url?: string
      color?: string
    }
    commands?: {
      start?: string
    }
    time: {
      created: number
      updated: number
      initialized?: number
    }
    sandboxes: string[]
  }

  type Row = typeof ProjectTable.$inferSelect

  function fromRow(row: Row): Info {
    const icon =
      row.icon_url || row.icon_color
        ? {
            url: row.icon_url ?? undefined,
            color: row.icon_color ?? undefined,
          }
        : undefined

    return {
      id: row.id,
      worktree: row.worktree,
      vcs: row.vcs === "git" ? "git" : undefined,
      name: row.name ?? undefined,
      icon,
      commands: row.commands ?? undefined,
      time: {
        created: row.time_created,
        updated: row.time_updated,
        initialized: row.time_initialized ?? undefined,
      },
      sandboxes: row.sandboxes,
    }
  }

  function runGit(cwd: string, args: string[]) {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
    })
    if (result.status !== 0) return undefined
    return result.stdout.trim()
  }

  function resolveFromGit(directory: string): GitProjectResolution {
    const sandbox = runGit(directory, ["rev-parse", "--show-toplevel"])
    if (!sandbox) {
      return {
        id: "global",
        sandbox: "/",
        worktree: "/",
      }
    }

    const roots = runGit(sandbox, ["rev-list", "--max-parents=0", "--all"])
      ?.split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .toSorted()

    if (!roots || roots.length === 0) {
      return {
        id: "global",
        sandbox,
        worktree: sandbox,
        vcs: "git",
      }
    }

    let worktree = sandbox
    const commonDir = runGit(sandbox, ["rev-parse", "--git-common-dir"])
    if (commonDir) {
      const dirname = path.dirname(commonDir)
      if (dirname !== ".") {
        worktree = path.resolve(sandbox, dirname)
      }
    }

    return {
      id: roots[0],
      sandbox,
      worktree,
      vcs: "git",
    }
  }

  export async function fromDirectory(directory: string) {
    const normalizedDirectory = path.resolve(directory)
    const resolved = resolveFromGit(normalizedDirectory)
    const existingRow = Database.use((db) => db.select().from(ProjectTable).where(eq(ProjectTable.id, resolved.id)).get())

    const now = Date.now()
    const existing: Info = existingRow
      ? fromRow(existingRow)
      : {
          id: resolved.id,
          worktree: resolved.worktree,
          vcs: resolved.vcs,
          sandboxes: [],
          time: {
            created: now,
            updated: now,
          },
        }

    const next: Info = {
      ...existing,
      worktree: resolved.worktree,
      vcs: resolved.vcs,
      time: {
        ...existing.time,
        updated: now,
      },
    }

    if (resolved.sandbox !== next.worktree && !next.sandboxes.includes(resolved.sandbox)) {
      next.sandboxes.push(resolved.sandbox)
    }
    next.sandboxes = next.sandboxes.filter((sandbox) => existsSync(sandbox))

    const insert = {
      id: next.id,
      worktree: next.worktree,
      vcs: next.vcs ?? null,
      name: next.name,
      icon_url: next.icon?.url,
      icon_color: next.icon?.color,
      commands: next.commands,
      sandboxes: next.sandboxes,
      time_created: next.time.created,
      time_updated: next.time.updated,
      time_initialized: next.time.initialized,
    }
    const updateSet = {
      worktree: next.worktree,
      vcs: next.vcs ?? null,
      name: next.name,
      icon_url: next.icon?.url,
      icon_color: next.icon?.color,
      commands: next.commands,
      sandboxes: next.sandboxes,
      time_updated: next.time.updated,
      time_initialized: next.time.initialized,
    }

    Database.use((db) => {
      db.insert(ProjectTable).values(insert).onConflictDoUpdate({ target: ProjectTable.id, set: updateSet }).run()
    })

    return {
      project: next,
      sandbox: resolved.sandbox,
    }
  }
}
