import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Instance } from "../src/project/instance.ts"
import { ApplyPatchTool } from "../src/tool/apply_patch.ts"
import { BashTool } from "../src/tool/bash.ts"
import { EditTool } from "../src/tool/edit.ts"
import { GlobTool } from "../src/tool/glob.ts"
import { GrepTool } from "../src/tool/grep.ts"
import { ToolRegistry } from "../src/tool/registry.ts"

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

function makeToolContext() {
  return {
    sessionID: "session_test_tools",
    messageID: "message_test_tools",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => undefined,
    ask: async () => undefined,
  } as any
}

describe("tooling parity additions", () => {
  test("registers core parity tools", async () => {
    const repo = createGitRepo("buddy-tools-registry")
    await Instance.provide({
      directory: repo,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("glob")
        expect(ids).toContain("grep")
        expect(ids).toContain("bash")
        expect(ids).toContain("edit")
        expect(ids).toContain("apply_patch")
      },
    })
  })

  test("glob finds matching files", async () => {
    const repo = createGitRepo("buddy-tools-glob")
    mkdirSync(path.join(repo, "src"), { recursive: true })
    writeFileSync(path.join(repo, "src/alpha.ts"), "export const alpha = 1\n")
    writeFileSync(path.join(repo, "src/beta.ts"), "export const beta = 2\n")
    writeFileSync(path.join(repo, "src/readme.md"), "# not-ts\n")

    await Instance.provide({
      directory: repo,
      fn: async () => {
        const tool = await GlobTool.init()
        const result = await tool.execute(
          {
            pattern: "src/**/*.ts",
          },
          makeToolContext(),
        )

        expect(result.output).toContain("src/alpha.ts")
        expect(result.output).toContain("src/beta.ts")
        expect(result.output).not.toContain("src/readme.md")
      },
    })
  })

  test("grep finds matching lines", async () => {
    const repo = createGitRepo("buddy-tools-grep")
    mkdirSync(path.join(repo, "src"), { recursive: true })
    writeFileSync(path.join(repo, "src/service.ts"), "const FLAG = 'buddy-parity-test'\n")

    await Instance.provide({
      directory: repo,
      fn: async () => {
        const tool = await GrepTool.init()
        const result = await tool.execute(
          {
            pattern: "buddy-parity-test",
            path: "src",
            include: "*.ts",
          },
          makeToolContext(),
        )

        expect(result.output).toContain("Found 1 matches")
        expect(result.output).toContain("src/service.ts")
        expect(result.output).toContain("buddy-parity-test")
      },
    })
  })

  test("bash executes command output", async () => {
    const repo = createGitRepo("buddy-tools-bash")

    await Instance.provide({
      directory: repo,
      fn: async () => {
        const tool = await BashTool.init()
        const result = await tool.execute(
          {
            command: "echo buddy-bash-ok",
            timeout: 2_000,
            description: "Echoes bash tool marker",
          },
          makeToolContext(),
        )

        expect(result.output).toContain("buddy-bash-ok")
      },
    })
  })

  test("edit updates an existing file", async () => {
    const repo = createGitRepo("buddy-tools-edit")
    mkdirSync(path.join(repo, "src"), { recursive: true })
    const filepath = path.join(repo, "src", "edit-target.ts")
    writeFileSync(filepath, "export const message = 'before'\n")

    await Instance.provide({
      directory: repo,
      fn: async () => {
        const tool = await EditTool.init()
        const result = await tool.execute(
          {
            filePath: "src/edit-target.ts",
            oldString: "before",
            newString: "after",
          },
          makeToolContext(),
        )

        expect(result.output).toContain("Edit applied successfully")
        expect(readFileSync(filepath, "utf8")).toContain("after")
      },
    })
  })

  test("apply_patch can add, update, and delete files", async () => {
    const repo = createGitRepo("buddy-tools-apply-patch")
    mkdirSync(path.join(repo, "src"), { recursive: true })
    const updatedFile = path.join(repo, "src", "main.ts")
    const deletedFile = path.join(repo, "src", "remove.ts")
    const addedFile = path.join(repo, "src", "added.ts")

    writeFileSync(updatedFile, "const greeting = 'hi'\n")
    writeFileSync(deletedFile, "to be deleted\n")

    const patchText = [
      "*** Begin Patch",
      "*** Update File: src/main.ts",
      "@@",
      "-const greeting = 'hi'",
      "+const greeting = 'hello'",
      "*** Add File: src/added.ts",
      "+export const added = true",
      "*** Delete File: src/remove.ts",
      "*** End Patch",
    ].join("\n")

    await Instance.provide({
      directory: repo,
      fn: async () => {
        const tool = await ApplyPatchTool.init()
        const result = await tool.execute(
          {
            patchText,
          },
          makeToolContext(),
        )

        expect(result.output).toContain("Success. Updated the following files")
      },
    })

    expect(readFileSync(updatedFile, "utf8")).toContain("'hello'")
    expect(readFileSync(addedFile, "utf8")).toContain("export const added = true")
    expect(existsSync(deletedFile)).toBe(false)
  })
})
