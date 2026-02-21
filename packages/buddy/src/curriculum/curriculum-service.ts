import fs from "node:fs/promises"
import { CurriculumPath } from "./curriculum-path.js"

const DEFAULT_CURRICULUM = [
  "# Curriculum",
  "",
  "## Kickoff",
  "- [ ] Define your first learning milestone",
  "",
].join("\n")

function hasChecklistMarker(markdown: string) {
  return /(^|\n)\s*[-*]\s+\[(?: |x|X)\]\s+/.test(markdown)
}

export namespace CurriculumService {
  export function validate(markdown: string) {
    if (!markdown.trim()) {
      throw new Error("Curriculum markdown cannot be empty")
    }
    if (!hasChecklistMarker(markdown)) {
      throw new Error("Curriculum must include at least one checklist task marker (e.g. - [ ] task)")
    }
  }

  export async function read() {
    const filepath = CurriculumPath.file()
    const markdown = await fs.readFile(filepath, "utf8").catch(() => undefined)

    if (markdown !== undefined) {
      return {
        path: filepath,
        markdown,
      }
    }

    const legacyPath = CurriculumPath.legacyFile()
    const legacyMarkdown = await fs.readFile(legacyPath, "utf8").catch(() => undefined)
    if (legacyMarkdown !== undefined) {
      await fs.mkdir(CurriculumPath.directory(), { recursive: true })
      await fs.writeFile(filepath, legacyMarkdown, "utf8")
      return {
        path: filepath,
        markdown: legacyMarkdown,
      }
    }

    await write(DEFAULT_CURRICULUM)
    return {
      path: filepath,
      markdown: DEFAULT_CURRICULUM,
    }
  }

  export async function write(markdown: string) {
    validate(markdown)

    const filepath = CurriculumPath.file()
    const dir = CurriculumPath.directory()
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filepath, markdown, "utf8")

    return {
      path: filepath,
      markdown,
    }
  }
}
