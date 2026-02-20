import fs from "fs/promises"
import path from "path"
import z from "zod"
import { tool } from "ai"
import { Instance } from "../project/instance.js"

const MAX_READ_BYTES = 50 * 1024
const MAX_READ_LINES = 200
const MAX_LIST_ENTRIES = 200

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

function isSecretPath(absolutePath: string) {
  const normalized = absolutePath.split(path.sep).join("/")
  return /(^|\/)\.env(\..+)?$/i.test(normalized)
}

function assertAllowedPath(rootPath: string, inputPath: string) {
  const absolutePath = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(rootPath, inputPath)

  const relativePath = path.relative(rootPath, absolutePath)
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path is outside the repository root")
  }

  if (isSecretPath(absolutePath)) {
    throw new Error("Access to .env files is blocked")
  }

  return absolutePath
}

function truncateByBytes(text: string, maxBytes: number) {
  const bytes = Buffer.byteLength(text, "utf-8")
  if (bytes <= maxBytes) {
    return {
      content: text,
      truncated: false,
    }
  }

  const encoded = Buffer.from(text, "utf-8")
  const content = encoded.subarray(0, maxBytes).toString("utf-8")
  return {
    content,
    truncated: true,
  }
}

function formatReadOutput(
  absolutePath: string,
  lines: string[],
  offset: number,
  hasMoreLines: boolean,
  wasByteTruncated: boolean,
) {
  const numbered = lines.map((line, index) => `${offset + index}: ${line}`)
  const tail = wasByteTruncated
    ? `(Output capped at ${MAX_READ_BYTES / 1024} KB)`
    : hasMoreLines
      ? `(Output capped at ${MAX_READ_LINES} lines)`
      : "(End of file)"

  return [`<path>${absolutePath}</path>`, "<content>", ...numbered, "", tail, "</content>"].join("\n")
}

async function listDirectoryEntries(workspaceRoot: string, startPath: string, extraIgnore: string[]) {
  const queue = [startPath]
  const output: string[] = []

  while (queue.length > 0 && output.length < MAX_LIST_ENTRIES) {
    const currentPath = queue.shift()
    if (!currentPath) break

    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (output.length >= MAX_LIST_ENTRIES) break
      if (extraIgnore.includes(entry.name)) continue
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue
      if (entry.name.startsWith(".env")) continue

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
    truncated: output.length >= MAX_LIST_ENTRIES,
  }
}

export function createChatTools() {
  return {
    read: tool({
      description: "Read a file or list a directory inside the repository.",
      inputSchema: z.object({
        filePath: z.string().describe("Path to a file or directory."),
        offset: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(MAX_READ_LINES).optional(),
      }),
      async execute(input) {
        const rootPath = path.resolve(Instance.directory)
        const absolutePath = assertAllowedPath(rootPath, input.filePath)
        const stat = await fs.stat(absolutePath).catch(() => undefined)

        if (!stat) {
          throw new Error(`Path not found: ${input.filePath}`)
        }

        if (stat.isDirectory()) {
          const entries = await fs.readdir(absolutePath, { withFileTypes: true })
          const listed = entries
            .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
            .sort((a, b) => a.localeCompare(b))
            .slice(0, MAX_LIST_ENTRIES)

          const truncated = entries.length > listed.length
          return {
            title: path.relative(rootPath, absolutePath) || ".",
            output: [`<path>${absolutePath}</path>`, "<entries>", ...listed, "</entries>"].join("\n"),
            metadata: {
              truncated,
              count: listed.length,
            },
          }
        }

        const raw = await fs.readFile(absolutePath, "utf-8")
        const byteLimited = truncateByBytes(raw, MAX_READ_BYTES)
        const lines = byteLimited.content.split(/\r?\n/)
        const offset = input.offset ?? 1
        const limit = input.limit ?? MAX_READ_LINES
        const start = offset - 1
        const selected = lines.slice(start, start + limit)
        const hasMoreLines = start + selected.length < lines.length
        const output = formatReadOutput(
          absolutePath,
          selected,
          offset,
          hasMoreLines,
          byteLimited.truncated,
        )

        return {
          title: path.relative(rootPath, absolutePath) || absolutePath,
          output,
          metadata: {
            truncated: hasMoreLines || byteLimited.truncated,
            lines: selected.length,
          },
        }
      },
    }),
    list: tool({
      description: "Recursively list files and folders inside the repository.",
      inputSchema: z.object({
        path: z.string().optional().describe("Directory path relative to the repository root."),
        ignore: z.array(z.string()).optional().describe("Directory names to ignore."),
      }),
      async execute(input) {
        const rootPath = path.resolve(Instance.directory)
        const absolutePath = assertAllowedPath(rootPath, input.path ?? ".")
        const stat = await fs.stat(absolutePath).catch(() => undefined)
        if (!stat || !stat.isDirectory()) {
          throw new Error("Path is not a directory")
        }

        const listed = await listDirectoryEntries(rootPath, absolutePath, input.ignore ?? [])
        return {
          title: path.relative(rootPath, absolutePath) || ".",
          output: listed.entries.join("\n"),
          metadata: {
            truncated: listed.truncated,
            count: listed.entries.length,
          },
        }
      },
    }),
  }
}
