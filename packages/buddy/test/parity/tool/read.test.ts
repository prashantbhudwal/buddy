import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { ReadTool } from "../../../src/tool/read.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.read", () => {
  test("reads file content with path envelope", async () => {
    await withRepo(async (directory) => {
      mkdirSync(path.join(directory, "src"), { recursive: true })
      writeFileSync(path.join(directory, "src", "read-target.ts"), "export const marker = 'read-parity'\n")

      await inDirectory(directory, async () => {
        const tool = await ReadTool.init()
        const result = await tool.execute(
          {
            filePath: "src/read-target.ts",
          },
          makeToolContext(),
        )
        expect(result.output).toContain("<path>")
        expect(result.output).toContain("read-parity")
      })
    })
  })

  test("lists directory entries when reading a directory", async () => {
    await withRepo(async (directory) => {
      mkdirSync(path.join(directory, "docs"), { recursive: true })
      writeFileSync(path.join(directory, "docs", "a.md"), "# A\n")

      await inDirectory(directory, async () => {
        const tool = await ReadTool.init()
        const result = await tool.execute(
          {
            filePath: "docs",
          },
          makeToolContext(),
        )
        expect(result.output).toContain("<type>directory</type>")
        expect(result.output).toContain("a.md")
      })
    })
  })
})
