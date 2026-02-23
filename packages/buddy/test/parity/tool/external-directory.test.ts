import { describe, expect, test } from "bun:test"
import path from "node:path"
import { assertExternalDirectory } from "../../../src/tool/external-directory.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.tool.external-directory", () => {
  test("does not ask for directory inside project", async () => {
    await withRepo(async (directory) => {
      let askCount = 0
      await inDirectory(directory, async () => {
        await assertExternalDirectory(
          {
            sessionID: "session_1",
            messageID: "message_1",
            agent: "build",
            abort: new AbortController().signal,
            messages: [],
            metadata: () => undefined,
            ask: async () => {
              askCount += 1
            },
          } as any,
          path.join(directory, "src", "file.ts"),
        )
      })
      expect(askCount).toBe(0)
    })
  })

  test("asks for external directory path outside project", async () => {
    await withRepo(async (directory) => {
      let asked = false
      await inDirectory(directory, async () => {
        await assertExternalDirectory(
          {
            sessionID: "session_1",
            messageID: "message_1",
            agent: "build",
            abort: new AbortController().signal,
            messages: [],
            metadata: () => undefined,
            ask: async (request: unknown) => {
              asked = true
              expect((request as { permission: string }).permission).toBe("external_directory")
            },
          } as any,
          "/tmp/outside-project/file.ts",
        )
      })
      expect(asked).toBe(true)
    })
  })
})
