import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { app } from "../src/index.ts"
import { Instance } from "../src/project/instance.ts"
import { PermissionNext } from "../src/permission/next.ts"

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createGitRepo(prefix: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  const marker = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), `# ${marker}\n`)
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe("permission and curriculum routes", () => {
  test("exposes pending permissions and supports once reply", async () => {
    const repo = createGitRepo("buddy-route-permission")

    const askPromise = Instance.provide({
      directory: repo,
      fn: () =>
        PermissionNext.ask({
          sessionID: "session_test_permission",
          permission: "read",
          patterns: ["/tmp/permission-test"],
          always: ["/tmp/*"],
          metadata: {},
          ruleset: [
            {
              permission: "read",
              pattern: "*",
              action: "ask",
            },
          ],
        }),
    })

    // allow the request to be registered before listing
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20)
    })

    const pendingResponse = await app.request("/api/permission", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(pendingResponse.status).toBe(200)
    const pending = (await pendingResponse.json()) as Array<{ id: string }>
    expect(pending.length).toBeGreaterThan(0)

    const requestID = pending[0].id

    const replyResponse = await app.request(`/api/permission/${requestID}/reply`, {
      method: "POST",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reply: "once",
      }),
    })

    expect(replyResponse.status).toBe(200)
    expect(await replyResponse.json()).toBe(true)

    await askPromise
  })

  test("serves and validates project curriculum markdown", async () => {
    const repo = createGitRepo("buddy-route-curriculum")

    const getResponse = await app.request("/api/curriculum", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(getResponse.status).toBe(200)
    const body = await json(getResponse)
    expect(String(body.markdown)).toContain("- [ ]")

    const putInvalid = await app.request("/api/curriculum", {
      method: "PUT",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        markdown: "# Curriculum without checklist",
      }),
    })

    expect(putInvalid.status).toBe(400)

    const putValid = await app.request("/api/curriculum", {
      method: "PUT",
      headers: {
        "x-buddy-directory": repo,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        markdown: "# Curriculum\n\n- [ ] Task one\n",
      }),
    })

    expect(putValid.status).toBe(200)

    const afterUpdate = await app.request("/api/curriculum", {
      headers: {
        "x-buddy-directory": repo,
      },
    })

    expect(afterUpdate.status).toBe(200)
    const updatedBody = await json(afterUpdate)
    expect(String(updatedBody.markdown)).toContain("Task one")
  })
})
