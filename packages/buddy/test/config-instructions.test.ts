import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Instance } from "../src/project/instance.js"
import { loadInstructions } from "../src/session/instruction.js"

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

describe("config instruction sources", () => {
  test("loads project AGENTS and config.instructions entries", async () => {
    const repo = createGitRepo("buddy-config-instructions")

    writeFileSync(path.join(repo, "AGENTS.md"), "# Project Agent Rules\nUse concise replies.\n")
    writeFileSync(path.join(repo, "notes.md"), "# Extra Notes\nAlways show a checklist.\n")

    writeFileSync(
      path.join(repo, "buddy.jsonc"),
      JSON.stringify(
        {
          instructions: ["notes.md"],
        },
        null,
        2,
      ) + "\n",
    )

    const instructions = await Instance.provide({
      directory: repo,
      fn: () => loadInstructions(),
    })

    expect(instructions.some((item) => item.includes("Instructions from:") && item.includes("AGENTS.md"))).toBe(true)
    expect(instructions.some((item) => item.includes("Extra Notes"))).toBe(true)
  })
})
