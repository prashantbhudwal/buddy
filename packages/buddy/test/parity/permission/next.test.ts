import { describe, expect, test } from "bun:test"
import { PermissionNext } from "../../../src/permission/next.js"

describe("parity.permission.next", () => {
  test("uses most recent matching rule", () => {
    const rules = PermissionNext.merge(
      PermissionNext.fromConfig({
        read: "deny",
      }),
      PermissionNext.fromConfig({
        read: "allow",
      }),
    )

    const result = PermissionNext.evaluate("read", "/tmp/file.txt", rules)
    expect(result.action).toBe("allow")
  })

  test("maps write/edit family into edit permission for disable checks", () => {
    const disabled = PermissionNext.disabled(
      ["read", "write", "edit", "patch", "multiedit", "grep"],
      PermissionNext.fromConfig({
        edit: "deny",
      }),
    )

    expect(disabled.has("write")).toBe(true)
    expect(disabled.has("edit")).toBe(true)
    expect(disabled.has("patch")).toBe(true)
    expect(disabled.has("multiedit")).toBe(true)
    expect(disabled.has("read")).toBe(false)
    expect(disabled.has("grep")).toBe(false)
  })
})
