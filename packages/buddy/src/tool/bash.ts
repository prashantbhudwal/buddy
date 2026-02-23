import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { assertExternalDirectory } from "./external-directory.js"
import { Instance } from "../project/instance.js"
import { Truncate } from "./truncation.js"
import DESCRIPTION from "./bash.txt"

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_METADATA_LENGTH = 30_000

function commandPrefix(command: string) {
  const first = command.trim().split(/\s+/)[0]
  if (!first) return "*"
  return `${first} *`
}

function resolveShellCommand(command: string) {
  if (process.platform === "win32") {
    const shell = process.env.COMSPEC || "cmd.exe"
    return [shell, "/d", "/s", "/c", command]
  }

  const shell = process.env.SHELL || "/bin/bash"
  return [shell, "-lc", command]
}

export const BashTool = Tool.define("bash", async () => ({
  description: DESCRIPTION
    .replaceAll("${directory}", Instance.directory)
    .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
    .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
  parameters: z.object({
    command: z.string().describe("Command to execute."),
    timeout: z.number().int().positive().optional().describe("Timeout in milliseconds."),
    workdir: z.string().optional().describe("Working directory. Defaults to current directory."),
    description: z.string().optional().describe("Short description shown in tool metadata."),
  }),
  async execute(params, ctx) {
    const cwdInput = params.workdir ?? Instance.directory
    const cwd = path.isAbsolute(cwdInput) ? path.normalize(cwdInput) : path.resolve(Instance.directory, cwdInput)

    await assertExternalDirectory(ctx, cwd, {
      kind: "directory",
      bypass: Boolean(ctx.extra?.bypassCwdCheck),
    })

    await ctx.ask({
      permission: "bash",
      patterns: [params.command],
      always: [commandPrefix(params.command)],
      metadata: {
        command: params.command,
        workdir: cwd,
      },
    })

    const timeout = params.timeout ?? DEFAULT_TIMEOUT_MS
    const spawned = Bun.spawn(resolveShellCommand(params.command), {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal: ctx.abort,
    })

    let timedOut = false
    let aborted = false
    let exited = false

    const kill = () => {
      try {
        spawned.kill()
      } catch {
        // ignore kill race
      }
    }

    if (ctx.abort.aborted) {
      aborted = true
      kill()
    }

    const abortListener = () => {
      aborted = true
      kill()
    }
    ctx.abort.addEventListener("abort", abortListener, { once: true })

    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeout)

    const stdoutPromise = spawned.stdout ? new Response(spawned.stdout).text() : Promise.resolve("")
    const stderrPromise = spawned.stderr ? new Response(spawned.stderr).text() : Promise.resolve("")

    let exitCode: number
    try {
      exitCode = await spawned.exited
      exited = true
    } finally {
      clearTimeout(timer)
      ctx.abort.removeEventListener("abort", abortListener)
    }

    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
    const output = [stdout, stderr].filter((item) => item.length > 0).join("\n")

    const metadata: Record<string, unknown> = {
      command: params.command,
      cwd,
      timeout,
      exitCode,
      timedOut,
      aborted,
      exited,
    }

    await ctx.metadata({
      title: params.description,
      metadata: {
        ...metadata,
        output: output.length > MAX_METADATA_LENGTH ? `${output.slice(0, MAX_METADATA_LENGTH)}\n\n...` : output,
      },
    })

    const notes: string[] = []
    if (timedOut) {
      notes.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
    }
    if (aborted) {
      notes.push("User aborted the command")
    }

    const finalOutput = [
      output || "(no output)",
      ...(notes.length > 0 ? ["", "<bash_metadata>", ...notes, "</bash_metadata>"] : []),
    ].join("\n")

    return {
      title: params.description ?? params.command,
      metadata,
      output: finalOutput,
    }
  },
}))
