import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { Database } from "../../../src/storage/db.js"
import { SessionStore } from "../../../src/session/session-store.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.storage.migration", () => {
  test("creates database file on first write path", async () => {
    await withRepo(async (directory) => {
      await inDirectory(directory, async () => {
        SessionStore.create()
        expect(Database.Path.endsWith("buddy.db")).toBe(true)
        expect(existsSync(Database.Path)).toBe(true)
      })
    })
  })

  test("runs queued transaction effects after commit", async () => {
    await withRepo(async (directory) => {
      await inDirectory(directory, async () => {
        const seen: string[] = []
        Database.transaction(() => {
          seen.push("tx")
          Database.effect(() => {
            seen.push("effect")
          })
        })
        expect(seen).toEqual(["tx", "effect"])
      })
    })
  })
})
