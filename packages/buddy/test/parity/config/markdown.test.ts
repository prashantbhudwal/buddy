import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { ConfigMarkdown } from "../../../src/config/markdown.js"
import { withRepo } from "../helpers"

describe("parity.config.markdown", () => {
  test("extracts @file mentions and shell commands", () => {
    const files = ConfigMarkdown.files("review @src/index.ts and @README.md")
    const shell = ConfigMarkdown.shell("run !`echo hello` before commit")

    expect(files.length).toBe(2)
    expect(shell.length).toBe(1)
    expect(shell[0]?.[1]).toBe("echo hello")
  })

  test("returns parsed markdown even with malformed yaml via fallback sanitization", async () => {
    await withRepo(async (directory) => {
      const filePath = path.join(directory, "bad.md")
      writeFileSync(
        filePath,
        [
          "---",
          "title: ok",
          "broken: [",
          "---",
          "# body",
          "",
        ].join("\n"),
      )

      const parsed = await ConfigMarkdown.parse(filePath)
      expect(parsed.content.includes("# body")).toBe(true)
    })
  })
})
