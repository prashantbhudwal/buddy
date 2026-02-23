import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "../../../src/tool/registry.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.tool.registry", () => {
  test("includes core parity tool ids", async () => {
    await withRepo(async (directory) => {
      const ids = await inDirectory(directory, () => ToolRegistry.ids())
      expect(ids).toContain("read")
      expect(ids).toContain("write")
      expect(ids).toContain("edit")
      expect(ids).toContain("apply_patch")
      expect(ids).toContain("bash")
      expect(ids).toContain("task")
    })
  })
})
