import { describe, expect, test } from "bun:test"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { Patch } from "../../../src/patch/index.js"
import { withRepo } from "../helpers"

describe("parity.patch", () => {
  test("parses patch envelope into hunks", () => {
    const parsed = Patch.parsePatch([
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+export const value = 1",
      "*** End Patch",
    ].join("\n"))

    expect(parsed.hunks).toHaveLength(1)
    expect(parsed.hunks[0]?.type).toBe("add")
  })

  test("derives updated content from update chunks", async () => {
    await withRepo(async (directory) => {
      const target = path.join(directory, "file.ts")
      writeFileSync(target, "const greeting = 'hi'\n")

      const output = Patch.deriveNewContentsFromChunks(target, [
        {
          old_lines: ["const greeting = 'hi'"],
          new_lines: ["const greeting = 'hello'"],
        },
      ])

      expect(output.content).toContain("'hello'")
    })
  })
})
