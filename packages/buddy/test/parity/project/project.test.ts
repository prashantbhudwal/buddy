import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { Project } from "../../../src/project/project.js"
import { inDirectory, withRepo } from "../helpers"

describe("parity.project.project", () => {
  test("uses same project identity across nested directories", async () => {
    await withRepo(async (directory) => {
      const nested = path.join(directory, "packages", "feature")
      mkdirSync(nested, { recursive: true })

      const rootProject = await inDirectory(directory, () => Project.fromDirectory(directory))
      const nestedProject = await inDirectory(nested, () => Project.fromDirectory(nested))

      expect(rootProject.project.id).toBe(nestedProject.project.id)
      expect(rootProject.project.worktree).toBe(nestedProject.project.worktree)
    })
  })

  test("returns different ids for unrelated repositories", async () => {
    await withRepo(async (repoA) => {
      await withRepo(async (repoB) => {
        const a = await inDirectory(repoA, () => Project.fromDirectory(repoA))
        const b = await inDirectory(repoB, () => Project.fromDirectory(repoB))
        expect(a.project.id).not.toBe(b.project.id)
      })
    })
  })
})
