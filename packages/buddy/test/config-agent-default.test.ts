import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Agent } from "../src/agent/agent.js"
import { Instance } from "../src/project/instance.js"

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
  runGit(root, ["init", "-q"])
  writeFileSync(path.join(root, "README.md"), "# test\n")
  runGit(root, ["add", "README.md"])
  runGit(root, ["-c", "user.email=buddy@test.local", "-c", "user.name=Buddy Test", "commit", "-qm", "init"])
  return root
}

describe("config default_agent", () => {
  test("rejects subagent as default_agent", async () => {
    const repo = createGitRepo("buddy-config-default-agent-sub")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_agent: "curriculum-builder",
        },
        null,
        2,
      ) + "\n",
    )

    await expect(
      Instance.provide({
        directory: repo,
        fn: () => Agent.defaultAgent(),
      }),
    ).rejects.toThrow("is a subagent")
  })

  test("uses configured primary default_agent", async () => {
    const repo = createGitRepo("buddy-config-default-agent-primary")
    fs.mkdirSync(path.join(repo, ".buddy", "agents"), { recursive: true })

    writeFileSync(
      path.join(repo, ".buddy", "agents", "coach.md"),
      [
        "---",
        "mode: primary",
        "description: coaching mode",
        "---",
        "You are a coaching agent.",
      ].join("\n"),
    )

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          default_agent: "coach",
        },
        null,
        2,
      ) + "\n",
    )

    const selected = await Instance.provide({
      directory: repo,
      fn: () => Agent.defaultAgent(),
    })

    expect(selected).toBe("coach")
  })
})
