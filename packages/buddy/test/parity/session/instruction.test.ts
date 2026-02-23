import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import {
  loadInstructions,
  resolveDirectoryInstructions,
  clearClaimed,
} from "../../../src/session/instruction.js"
import type { MessageWithParts } from "../../../src/session/message-v2/index.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.session.instruction", () => {
  test("loads root AGENTS instructions", async () => {
    await withRepo(async (directory) => {
      writeFileSync(path.join(directory, "AGENTS.md"), "# Root rules\nUse concise responses.\n")

      const loaded = await inDirectory(directory, () => loadInstructions())
      expect(loaded.some((item) => item.includes("Root rules"))).toBe(true)
    })
  })

  test("resolves subdirectory AGENTS file once per message", async () => {
    await withRepo(async (directory) => {
      const nested = path.join(directory, "src", "feature")
      mkdirSync(nested, { recursive: true })
      writeFileSync(path.join(nested, "AGENTS.md"), "# Nested rules\nUse checklist outputs.\n")
      writeFileSync(path.join(nested, "file.ts"), "export const value = 1\n")

      const emptyHistory: MessageWithParts[] = []
      const messageID = "message_instructions_1"

      const first = await inDirectory(directory, () =>
        resolveDirectoryInstructions({
          messages: emptyHistory,
          filepath: path.join(nested, "file.ts"),
          messageID,
        }),
      )
      expect(first.length).toBe(1)
      expect(first[0]?.content.includes("Nested rules")).toBe(true)

      const second = await inDirectory(directory, () =>
        resolveDirectoryInstructions({
          messages: emptyHistory,
          filepath: path.join(nested, "file.ts"),
          messageID,
        }),
      )
      expect(second).toHaveLength(0)

      clearClaimed(messageID)
    })
  })
})
