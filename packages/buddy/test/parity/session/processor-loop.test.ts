import { describe, expect, test } from "bun:test"
import { app } from "../../../src/index.ts"
import { SessionStore } from "../../../src/session/session-store.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.session.processor-loop", () => {
  test("prompt route returns 409 when session is already busy", async () => {
    await withRepo(async (directory) => {
      const sessionID = await inDirectory(directory, async () => {
        const session = SessionStore.create()
        SessionStore.setActiveAbort(session.id, new AbortController())
        return session.id
      })

      const response = await app.request(`/api/session/${sessionID}/message`, {
        method: "POST",
        headers: {
          "x-buddy-directory": directory,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "run while busy",
        }),
      })

      expect(response.status).toBe(409)
    })
  })

  test("abort route returns false when session is idle", async () => {
    await withRepo(async (directory) => {
      const sessionID = await inDirectory(directory, async () => SessionStore.create().id)

      const response = await app.request(`/api/session/${sessionID}/abort`, {
        method: "POST",
        headers: {
          "x-buddy-directory": directory,
        },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toBe(false)
    })
  })
})
