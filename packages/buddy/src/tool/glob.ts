import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { Instance } from "../project/instance.js"
import { assertExternalDirectory } from "./external-directory.js"
import DESCRIPTION from "./glob.txt"

const LIMIT = 100

type Match = {
  path: string
  mtime: number
}

async function mtime(filepath: string) {
  const stat = await fs.stat(filepath).catch(() => undefined)
  if (!stat?.isFile()) return undefined
  return stat.mtime.getTime()
}

export const GlobTool = Tool.define("glob", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("Glob pattern to match file paths against."),
    path: z.string().optional().describe("Directory to search in. Defaults to current directory."),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "glob",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
      },
    })

    const searchPathInput = params.path ?? Instance.directory
    const searchPath = path.isAbsolute(searchPathInput)
      ? path.normalize(searchPathInput)
      : path.resolve(Instance.directory, searchPathInput)

    await assertExternalDirectory(ctx, searchPath, {
      kind: "directory",
      bypass: Boolean(ctx.extra?.bypassCwdCheck),
    })

    const glob = new Bun.Glob(params.pattern)
    const found: Match[] = []
    let truncated = false

    for await (const item of glob.scan({ cwd: searchPath, absolute: true })) {
      const absolute = path.resolve(searchPath, item)
      const modified = await mtime(absolute)
      if (modified === undefined) continue

      found.push({
        path: absolute,
        mtime: modified,
      })

      if (found.length > LIMIT) {
        truncated = true
        break
      }
    }

    found.sort((a, b) => b.mtime - a.mtime)

    const matches = truncated ? found.slice(0, LIMIT) : found
    if (matches.length === 0) {
      return {
        title: path.relative(Instance.worktree, searchPath) || ".",
        metadata: {
          count: 0,
          truncated: false,
        },
        output: "No files found",
      }
    }

    const output = [
      ...matches.map((match) => match.path),
      ...(truncated
        ? ["", `(Results are truncated: showing first ${LIMIT} matches. Use a narrower pattern/path.)`]
        : []),
    ].join("\n")

    return {
      title: path.relative(Instance.worktree, searchPath) || ".",
      metadata: {
        count: matches.length,
        truncated,
      },
      output,
    }
  },
})
