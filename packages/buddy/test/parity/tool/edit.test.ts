import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { EditTool } from "../../../src/tool/edit.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.edit", () => {
  test("replaces exact text in file", async () => {
    await withRepo(async (directory) => {
      mkdirSync(path.join(directory, "src"), { recursive: true })
      const filePath = path.join(directory, "src", "edit-target.ts")
      writeFileSync(filePath, "export const value = 'before'\n")

      await inDirectory(directory, async () => {
        const tool = await EditTool.init()
        const result = await tool.execute(
          {
            filePath: "src/edit-target.ts",
            oldString: "before",
            newString: "after",
          },
          makeToolContext(),
        )
        expect(result.output).toContain("Edit applied successfully")
      })

      expect(readFileSync(filePath, "utf8")).toContain("after")
    })
  })
})
