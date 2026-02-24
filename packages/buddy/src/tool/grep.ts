import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { Instance } from "../project/instance.js"
import { assertExternalDirectory } from "./external-directory.js"
import DESCRIPTION from "./grep.txt"

const MAX_LINE_LENGTH = 2_000
const OUTPUT_LIMIT = 100

type Match = {
  path: string
  lineNum: number
  lineText: string
  mtime: number
}

function parseRipgrepLine(line: string) {
  const first = line.indexOf("|")
  if (first === -1) return undefined
  const second = line.indexOf("|", first + 1)
  if (second === -1) return undefined

  const filePath = line.slice(0, first)
  const lineNumber = Number.parseInt(line.slice(first + 1, second), 10)
  const lineText = line.slice(second + 1)
  if (!filePath || !Number.isFinite(lineNumber) || lineNumber <= 0) return undefined

  return {
    filePath,
    lineNumber,
    lineText,
  }
}

async function statMtime(filepath: string) {
  const stat = await fs.stat(filepath).catch(() => undefined)
  if (!stat?.isFile()) return undefined
  return stat.mtime.getTime()
}

async function grepWithRipgrep(input: { pattern: string; include?: string; searchPath: string; abort: AbortSignal }) {
  const rg = Bun.which("rg")
  if (!rg) {
    return undefined
  }

  const args = ["-nH", "--hidden", "--no-messages", "--field-match-separator=|", "--regexp", input.pattern]
  if (input.include) {
    args.push("--glob", input.include)
  }
  args.push(input.searchPath)

  const proc = Bun.spawn([rg, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    signal: input.abort,
  })

  const outputPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("")
  const errorPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("")
  const exitCode = await proc.exited
  const [output, errorOutput] = await Promise.all([outputPromise, errorPromise])

  return {
    exitCode,
    output,
    errorOutput,
  }
}

async function grepWithFallback(input: { pattern: string; include?: string; searchPath: string; abort: AbortSignal }) {
  let regex: RegExp
  try {
    regex = new RegExp(input.pattern)
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${input.pattern}`, {
      cause: error,
    })
  }

  const pattern = input.include ?? "**/*"
  const glob = new Bun.Glob(pattern)
  const lines: string[] = []
  for await (const item of glob.scan({ cwd: input.searchPath, absolute: true })) {
    input.abort.throwIfAborted()

    const absolutePath = path.resolve(input.searchPath, item)
    const stat = await fs.stat(absolutePath).catch(() => undefined)
    if (!stat?.isFile()) continue

    const content = await fs.readFile(absolutePath, "utf8").catch(() => undefined)
    if (content === undefined) continue

    const split = content.split(/\r?\n/)
    for (let index = 0; index < split.length; index += 1) {
      const line = split[index]
      if (!regex.test(line)) continue
      lines.push(`${absolutePath}|${index + 1}|${line}`)
    }
  }

  return {
    exitCode: lines.length > 0 ? 0 : 1,
    output: lines.join("\n"),
    errorOutput: "",
  }
}

export const GrepTool = Tool.define("grep", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("Regex pattern to search for in file contents."),
    path: z.string().optional().describe("Directory to search in. Defaults to current directory."),
    include: z.string().optional().describe('File glob filter (e.g. "*.ts", "*.{ts,tsx}").'),
  }),
  async execute(params, ctx) {
    if (!params.pattern.trim()) {
      throw new Error("pattern is required")
    }

    await ctx.ask({
      permission: "grep",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
        include: params.include,
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

    const rgResult =
      (await grepWithRipgrep({
        pattern: params.pattern,
        include: params.include,
        searchPath,
        abort: ctx.abort,
      })) ??
      (await grepWithFallback({
        pattern: params.pattern,
        include: params.include,
        searchPath,
        abort: ctx.abort,
      }))

    if (rgResult.exitCode === 1) {
      return {
        title: params.pattern,
        metadata: {
          matches: 0,
          truncated: false,
        },
        output: "No files found",
      }
    }

    if (rgResult.exitCode !== 0 && rgResult.exitCode !== 2) {
      throw new Error(`grep failed: ${rgResult.errorOutput || rgResult.output || "unknown error"}`)
    }

    const rawLines = rgResult.output.trim().length > 0 ? rgResult.output.trim().split(/\r?\n/) : []
    const matches: Match[] = []
    for (const line of rawLines) {
      const parsed = parseRipgrepLine(line)
      if (!parsed) continue

      const mtime = await statMtime(parsed.filePath)
      if (mtime === undefined) continue

      matches.push({
        path: parsed.filePath,
        lineNum: parsed.lineNumber,
        lineText: parsed.lineText,
        mtime,
      })
    }

    matches.sort((a, b) => b.mtime - a.mtime)

    if (matches.length === 0) {
      return {
        title: params.pattern,
        metadata: {
          matches: 0,
          truncated: false,
        },
        output: "No files found",
      }
    }

    const truncated = matches.length > OUTPUT_LIMIT
    const visible = truncated ? matches.slice(0, OUTPUT_LIMIT) : matches

    const outputLines = [`Found ${matches.length} matches${truncated ? ` (showing first ${OUTPUT_LIMIT})` : ""}`]

    let currentPath = ""
    for (const match of visible) {
      if (match.path !== currentPath) {
        if (currentPath.length > 0) {
          outputLines.push("")
        }
        currentPath = match.path
        outputLines.push(`${match.path}:`)
      }

      const snippet =
        match.lineText.length > MAX_LINE_LENGTH ? `${match.lineText.slice(0, MAX_LINE_LENGTH)}...` : match.lineText
      outputLines.push(`  Line ${match.lineNum}: ${snippet}`)
    }

    if (truncated) {
      outputLines.push("")
      outputLines.push(
        `(Results truncated: showing ${OUTPUT_LIMIT} of ${matches.length} matches. Use a narrower pattern/path.)`,
      )
    }

    if (rgResult.exitCode === 2) {
      outputLines.push("")
      outputLines.push("(Some paths were inaccessible and skipped)")
    }

    return {
      title: params.pattern,
      metadata: {
        matches: matches.length,
        truncated,
      },
      output: outputLines.join("\n"),
    }
  },
})
