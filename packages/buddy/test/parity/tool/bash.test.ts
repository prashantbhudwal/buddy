import { describe, expect, test } from "bun:test"
import { BashTool } from "../../../src/tool/bash.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.bash", () => {
  test("executes command and returns stdout", async () => {
    await withRepo(async (directory) => {
      await inDirectory(directory, async () => {
        const tool = await BashTool.init()
        const result = await tool.execute(
          {
            command: "echo parity-bash",
            timeout: 2_000,
            description: "test echo",
          },
          makeToolContext(),
        )

        expect(result.output).toContain("parity-bash")
      })
    })
  })
})
