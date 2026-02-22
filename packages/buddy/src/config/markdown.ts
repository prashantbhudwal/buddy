import fs from "node:fs/promises"
import matter from "gray-matter"

export namespace ConfigMarkdown {
  export const FILE_REGEX = /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g
  export const SHELL_REGEX = /!`([^`]+)`/g

  export function files(template: string) {
    return Array.from(template.matchAll(FILE_REGEX))
  }

  export function shell(template: string) {
    return Array.from(template.matchAll(SHELL_REGEX))
  }

  // Claude-style agent markdown often has malformed YAML frontmatter.
  // Try a permissive pass before surfacing an error.
  export function fallbackSanitization(content: string): string {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!match) return content

    const frontmatter = match[1]
    const lines = frontmatter.split("\n")
    const result: string[] = []

    for (const line of lines) {
      if (line.trim().startsWith("#") || line.trim() === "") {
        result.push(line)
        continue
      }

      if (line.match(/^\s+/)) {
        result.push(line)
        continue
      }

      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
      if (!kvMatch) {
        result.push(line)
        continue
      }

      const key = kvMatch[1]
      const value = kvMatch[2].trim()

      if (value === "" || value === ">" || value === "|" || value.startsWith('"') || value.startsWith("'")) {
        result.push(line)
        continue
      }

      if (value.includes(":")) {
        result.push(`${key}: |-`)
        result.push(`  ${value}`)
        continue
      }

      result.push(line)
    }

    const processed = result.join("\n")
    return content.replace(frontmatter, () => processed)
  }

  export async function parse(filePath: string) {
    const template = await fs.readFile(filePath, "utf8")

    try {
      return matter(template)
    } catch {
      try {
        return matter(fallbackSanitization(template))
      } catch (err) {
        throw new FrontmatterError({
          path: filePath,
          message: `${filePath}: Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }
}

export class FrontmatterError extends Error {
  readonly data: {
    path: string
    message: string
  }

  constructor(data: { path: string; message: string }) {
    super(data.message)
    this.name = "ConfigFrontmatterError"
    this.data = data
  }
}
