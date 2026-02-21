import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { Instance } from "../project/instance.js"
import { assertExternalDirectory } from "./external-directory.js"
import DESCRIPTION from "./list.txt"

const LIMIT = 200

const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
  "tmp",
  "temp",
])

async function listDirectoryEntries(workspaceRoot: string, startPath: string, extraIgnore: string[]) {
  const queue = [startPath]
  const output: string[] = []

  while (queue.length > 0 && output.length < LIMIT) {
    const currentPath = queue.shift()
    if (!currentPath) break

    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (output.length >= LIMIT) break
      if (extraIgnore.includes(entry.name)) continue
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue

      const absoluteEntryPath = path.join(currentPath, entry.name)
      const relativeEntryPath = path.relative(workspaceRoot, absoluteEntryPath) || "."

      if (entry.isDirectory()) {
        output.push(`${relativeEntryPath}/`)
        queue.push(absoluteEntryPath)
        continue
      }

      output.push(relativeEntryPath)
    }
  }

  return {
    entries: output,
    truncated: output.length >= LIMIT,
  }
}

export const ListTool = Tool.define("list", {
  description: DESCRIPTION,
  parameters: z.object({
    path: z.string().optional().describe("Directory path relative to the current directory."),
    ignore: z.array(z.string()).optional().describe("Directory names to ignore."),
  }),
  async execute(params, ctx) {
    const searchPath = path.resolve(Instance.directory, params.path ?? ".")

    await assertExternalDirectory(ctx, searchPath, {
      kind: "directory",
      bypass: Boolean(ctx.extra?.bypassCwdCheck),
    })

    await ctx.ask({
      permission: "list",
      patterns: [searchPath],
      always: ["*"],
      metadata: {
        path: searchPath,
      },
    })

    const stat = await fs.stat(searchPath).catch(() => undefined)
    if (!stat || !stat.isDirectory()) {
      throw new Error("Path is not a directory")
    }

    const listed = await listDirectoryEntries(searchPath, searchPath, params.ignore ?? [])

    return {
      title: path.relative(Instance.worktree, searchPath) || ".",
      output: listed.entries.join("\n"),
      metadata: {
        truncated: listed.truncated,
        count: listed.entries.length,
      },
    }
  },
})
