import { describe, expect, test } from "bun:test"
import path from "node:path"
import { readFileSync } from "node:fs"
import { WriteTool } from "../../../src/tool/write.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.write", () => {
  test("writes file content to workspace path", async () => {
    await withRepo(async (directory) => {
      const target = path.join(directory, "output", "result.txt")

      await inDirectory(directory, async () => {
        const tool = await WriteTool.init()
        const result = await tool.execute(
          {
            filePath: "output/result.txt",
            content: "write parity marker",
          },
          makeToolContext(),
        )
        expect(result.output).toContain("Wrote file successfully")
      })

      expect(readFileSync(target, "utf8")).toBe("write parity marker")
    })
  })
})
