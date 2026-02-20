import { describe, expect, test } from "bun:test"
import { SessionStore } from "../src/session/session-store.ts"
import type { UserMessage } from "../src/session/message-v2/index.ts"
import { Instance } from "../src/project/instance.ts"

function runInDirectory<T>(directory: string, fn: () => T | Promise<T>) {
  return Instance.provide({
    directory,
    fn,
  })
}

describe("session store", () => {
  test("tracks busy state with abort controller", async () => {
    await runInDirectory("/tmp/buddy-test-dir-a", async () => {
      const session = SessionStore.create()
      const controller = new AbortController()

      expect(SessionStore.isBusy(session.id)).toBe(false)

      SessionStore.setActiveAbort(session.id, controller)
      expect(SessionStore.isBusy(session.id)).toBe(true)

      const aborted = SessionStore.abort(session.id)
      expect(aborted).toBe(true)
      expect(controller.signal.aborted).toBe(true)

      SessionStore.clearActiveAbort(session.id)
      expect(SessionStore.isBusy(session.id)).toBe(false)
    })
  })

  test("appends and updates text part deltas", async () => {
    await runInDirectory("/tmp/buddy-test-dir-b", async () => {
      const session = SessionStore.create()
      const now = Date.now()
      const user: UserMessage = {
        id: "message_test_user",
        sessionID: session.id,
        role: "user",
        time: { created: now },
      }

      SessionStore.appendMessage(user)
      SessionStore.appendPart({
        id: "part_test_text",
        sessionID: session.id,
        messageID: user.id,
        type: "text",
        text: "hello",
        time: { start: now },
      })

      SessionStore.updatePartDelta({
        sessionID: session.id,
        messageID: user.id,
        partID: "part_test_text",
        field: "text",
        delta: " world",
      })

      const message = SessionStore.getMessageWithParts(session.id, user.id)
      const part = message?.parts[0]

      expect(part?.type).toBe("text")
      if (part?.type === "text") {
        expect(part.text).toBe("hello world")
      }
    })
  })

  test("isolates sessions per directory", async () => {
    let sessionA = ""
    await runInDirectory("/tmp/buddy-tenant-a", async () => {
      sessionA = SessionStore.create().id
      expect(SessionStore.get(sessionA)).toBeDefined()
    })

    await runInDirectory("/tmp/buddy-tenant-b", async () => {
      expect(SessionStore.get(sessionA)).toBeUndefined()
      const sessionB = SessionStore.create().id
      expect(SessionStore.get(sessionB)).toBeDefined()
    })
  })
})
