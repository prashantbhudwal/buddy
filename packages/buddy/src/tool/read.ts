import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { Instance } from "../project/instance.js"
import { assertExternalDirectory } from "./external-directory.js"
import DESCRIPTION from "./read.txt"

const MAX_READ_BYTES = 50 * 1024
const MAX_READ_LINES = 2_000

function truncateByBytes(text: string, maxBytes: number) {
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes <= maxBytes) {
    return {
      content: text,
      truncated: false,
    }
  }

  const encoded = Buffer.from(text, "utf8")
  return {
    content: encoded.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  }
}

function formatFileOutput(input: {
  absolutePath: string
  lines: string[]
  offset: number
  hasMoreLines: boolean
  byteTruncated: boolean
}) {
  const numbered = input.lines.map((line, index) => `${input.offset + index}: ${line}`)
  const tail = input.byteTruncated
    ? `(Output capped at ${MAX_READ_BYTES / 1024} KB)`
    : input.hasMoreLines
      ? `(Output capped at ${MAX_READ_LINES} lines)`
      : "(End of file)"

  return [`<path>${input.absolutePath}</path>`, "<type>file</type>", "<content>", ...numbered, "", tail, "</content>"].join(
    "\n",
  )
}

export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("Absolute or relative path to a file or directory."),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(MAX_READ_LINES).optional(),
  }),
  async execute(params, ctx) {
    const filepath = path.isAbsolute(params.filePath)
      ? path.normalize(params.filePath)
      : path.resolve(Instance.directory, params.filePath)

    const stat = await fs.stat(filepath).catch(() => undefined)
    await assertExternalDirectory(ctx, filepath, {
      kind: stat?.isDirectory() ? "directory" : "file",
      bypass: Boolean(ctx.extra?.bypassCwdCheck),
    })

    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {
        path: filepath,
      },
    })

    if (!stat) {
      throw new Error(`Path not found: ${params.filePath}`)
    }

    if (stat.isDirectory()) {
      const entries = await fs.readdir(filepath, { withFileTypes: true })
      const listed = entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort((a, b) => a.localeCompare(b))

      const offset = params.offset ?? 1
      const limit = params.limit ?? MAX_READ_LINES
      const start = offset - 1
      const outputEntries = listed.slice(start, start + limit)
      const truncated = start + outputEntries.length < listed.length

      const output = [
        `<path>${filepath}</path>`,
        "<type>directory</type>",
        "<entries>",
        ...outputEntries,
        truncated
          ? `(Showing ${outputEntries.length} of ${listed.length} entries. Use offset=${offset + outputEntries.length} to continue.)`
          : `(End of directory, ${listed.length} entries)`,
        "</entries>",
      ].join("\n")

      return {
        title: path.relative(Instance.worktree, filepath) || ".",
        output,
        metadata: {
          truncated,
          count: outputEntries.length,
          preview: outputEntries.slice(0, 20).join("\n"),
        },
      }
    }

    const raw = await fs.readFile(filepath, "utf8")
    const byteLimited = truncateByBytes(raw, MAX_READ_BYTES)
    const lines = byteLimited.content.split(/\r?\n/)
    const offset = params.offset ?? 1
    const limit = params.limit ?? MAX_READ_LINES
    const start = offset - 1
    const selected = lines.slice(start, start + limit)
    const hasMoreLines = start + selected.length < lines.length

    return {
      title: path.relative(Instance.worktree, filepath) || filepath,
      output: formatFileOutput({
        absolutePath: filepath,
        lines: selected,
        offset,
        hasMoreLines,
        byteTruncated: byteLimited.truncated,
      }),
      metadata: {
        truncated: hasMoreLines || byteLimited.truncated,
        count: selected.length,
        preview: selected.slice(0, 20).join("\n"),
      },
    }
  },
})
