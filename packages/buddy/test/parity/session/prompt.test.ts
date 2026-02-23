import { describe, expect, test } from "bun:test"
import { SessionPrompt } from "../../../src/session/prompt.js"
import { SessionStore } from "../../../src/session/session-store.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.session.prompt", () => {
  test("creates user message when noReply is enabled", async () => {
    await withRepo(async (directory) => {
      await inDirectory(directory, async () => {
        const session = SessionStore.create()
        const message = await SessionPrompt.prompt({
          sessionID: session.id,
          content: "hello parity",
          noReply: true,
        })

        expect(message.info.role).toBe("user")
        expect(message.parts[0]?.type).toBe("text")
      })
    })
  })

  test("rejects prompt when session is already busy", async () => {
    await withRepo(async (directory) => {
      await inDirectory(directory, async () => {
        const session = SessionStore.create()
        SessionStore.setActiveAbort(session.id, new AbortController())

        await expect(
          SessionPrompt.prompt({
            sessionID: session.id,
            content: "should fail while busy",
            noReply: true,
          }),
        ).rejects.toThrow("already running")

        SessionStore.clearActiveAbort(session.id)
      })
    })
  })
})
