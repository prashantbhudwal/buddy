import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import { Global } from "../storage/global.js"

export namespace Truncate {
  export const MAX_LINES = 2_000
  export const MAX_BYTES = 50 * 1024
  export const DIR = path.join(Global.Path.data, "tool-output")
  export const GLOB = path.join(DIR, "*")

  export type Result =
    | {
        content: string
        truncated: false
      }
    | {
        content: string
        truncated: true
        outputPath: string
      }

  export type Options = {
    maxLines?: number
    maxBytes?: number
    direction?: "head" | "tail"
  }

  function truncateLines(input: string, options: Required<Options>) {
    const lines = input.split("\n")
    const totalBytes = Buffer.byteLength(input, "utf8")
    if (lines.length <= options.maxLines && totalBytes <= options.maxBytes) {
      return {
        truncated: false as const,
        content: input,
      }
    }

    const output: string[] = []
    let bytes = 0
    let hitBytes = false

    if (options.direction === "head") {
      for (let i = 0; i < lines.length && output.length < options.maxLines; i += 1) {
        const line = lines[i]
        const size = Buffer.byteLength(line, "utf8") + (output.length > 0 ? 1 : 0)
        if (bytes + size > options.maxBytes) {
          hitBytes = true
          break
        }
        output.push(line)
        bytes += size
      }
    } else {
      for (let i = lines.length - 1; i >= 0 && output.length < options.maxLines; i -= 1) {
        const line = lines[i]
        const size = Buffer.byteLength(line, "utf8") + (output.length > 0 ? 1 : 0)
        if (bytes + size > options.maxBytes) {
          hitBytes = true
          break
        }
        output.unshift(line)
        bytes += size
      }
    }

    const removed = hitBytes ? totalBytes - bytes : lines.length - output.length
    const unit = hitBytes ? "bytes" : "lines"

    if (options.direction === "head") {
      return {
        truncated: true as const,
        content: `${output.join("\n")}\n\n...${removed} ${unit} truncated...`,
      }
    }

    return {
      truncated: true as const,
      content: `...${removed} ${unit} truncated...\n\n${output.join("\n")}`,
    }
  }

  export async function output(input: string, options: Options = {}): Promise<Result> {
    const withDefaults: Required<Options> = {
      direction: options.direction ?? "head",
      maxBytes: options.maxBytes ?? MAX_BYTES,
      maxLines: options.maxLines ?? MAX_LINES,
    }

    const truncated = truncateLines(input, withDefaults)
    if (!truncated.truncated) {
      return {
        content: truncated.content,
        truncated: false,
      }
    }

    await fs.mkdir(DIR, { recursive: true })
    const outputPath = path.join(DIR, `tool_${ulid().toLowerCase()}`)
    await fs.writeFile(outputPath, input, "utf8")

    return {
      content:
        `${truncated.content}\n\nThe full output was saved to ${outputPath}. ` +
        "Use read with offset/limit or grep to inspect specific sections.",
      truncated: true,
      outputPath,
    }
  }
}
