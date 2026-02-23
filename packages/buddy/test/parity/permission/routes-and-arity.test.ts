import { describe, expect, test } from "bun:test"
import { app } from "../../../src/index.ts"
import { PermissionNext } from "../../../src/permission/next.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.permission.routes-and-arity", () => {
  test("request and reply payload schemas stay compatible", () => {
    const request = PermissionNext.Request.parse({
      id: "permission_1",
      sessionID: "session_1",
      permission: "read",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    expect(request.permission).toBe("read")
    expect(PermissionNext.Reply.parse("once")).toBe("once")
    expect(PermissionNext.Reply.parse("always")).toBe("always")
    expect(PermissionNext.Reply.parse("reject")).toBe("reject")
  })

  test("lists pending request and resolves through reply route", async () => {
    await withRepo(async (directory) => {
      const ask = inDirectory(directory, () =>
        PermissionNext.ask({
          sessionID: "session_route_parity",
          permission: "read",
          patterns: ["/tmp/test"],
          always: ["/tmp/*"],
          metadata: {},
          ruleset: PermissionNext.fromConfig({
            read: "ask",
          }),
        }),
      )

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20)
      })

      const listed = await app.request("/api/permission", {
        headers: {
          "x-buddy-directory": directory,
        },
      })
      expect(listed.status).toBe(200)
      const pending = (await listed.json()) as Array<{ id: string }>
      expect(pending.length).toBeGreaterThan(0)

      const replied = await app.request(`/api/permission/${pending[0].id}/reply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": directory,
        },
        body: JSON.stringify({
          reply: "once",
        }),
      })
      expect(replied.status).toBe(200)
      expect(await replied.json()).toBe(true)

      await ask
    })
  })
})
