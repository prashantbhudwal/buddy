import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { GrepTool } from "../../../src/tool/grep.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.grep", () => {
  test("finds matching content in directory", async () => {
    await withRepo(async (directory) => {
      mkdirSync(path.join(directory, "src"), { recursive: true })
      writeFileSync(path.join(directory, "src", "feature.ts"), "const marker = 'parity-grep'\n")

      await inDirectory(directory, async () => {
        const tool = await GrepTool.init()
        const result = await tool.execute(
          {
            pattern: "parity-grep",
            path: "src",
            include: "*.ts",
          },
          makeToolContext(),
        )

        expect(result.output).toContain("Found 1 matches")
        expect(result.output).toContain("feature.ts")
      })
    })
  })
})
