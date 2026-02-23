import { describe, expect, test } from "bun:test"
import path from "node:path"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { ApplyPatchTool } from "../../../src/tool/apply_patch.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.apply_patch", () => {
  test("adds, updates, and deletes files from patch envelope", async () => {
    await withRepo(async (directory) => {
      mkdirSync(path.join(directory, "src"), { recursive: true })
      const updatedFile = path.join(directory, "src", "main.ts")
      const deletedFile = path.join(directory, "src", "remove.ts")
      const addedFile = path.join(directory, "src", "added.ts")

      writeFileSync(updatedFile, "const greeting = 'hi'\n")
      writeFileSync(deletedFile, "delete me\n")

      const patchText = [
        "*** Begin Patch",
        "*** Update File: src/main.ts",
        "@@",
        "-const greeting = 'hi'",
        "+const greeting = 'hello'",
        "*** Add File: src/added.ts",
        "+export const added = true",
        "*** Delete File: src/remove.ts",
        "*** End Patch",
      ].join("\n")

      await inDirectory(directory, async () => {
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute({ patchText }, makeToolContext())
        expect(result.output).toContain("Success. Updated the following files")
      })

      expect(readFileSync(updatedFile, "utf8")).toContain("'hello'")
      expect(readFileSync(addedFile, "utf8")).toContain("export const added = true")
      expect(existsSync(deletedFile)).toBe(false)
    })
  })
})
