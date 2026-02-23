import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { Instance } from "../project/instance.js"
import { assertExternalDirectory } from "./external-directory.js"
import { Patch } from "../patch/index.js"
import DESCRIPTION from "./apply_patch.txt"

const PatchParams = z.object({
  patchText: z.string().describe("The full patch text that describes all changes to be made."),
})

type FileChange = {
  filePath: string
  oldContent: string
  newContent: string
  type: "add" | "update" | "delete" | "move"
  movePath?: string
}

export const ApplyPatchTool = Tool.define("apply_patch", {
  description: DESCRIPTION,
  parameters: PatchParams,
  async execute(params, ctx) {
    if (!params.patchText) {
      throw new Error("patchText is required")
    }

    let hunks: Patch.Hunk[]
    try {
      const parsed = Patch.parsePatch(params.patchText)
      hunks = parsed.hunks
    } catch (error) {
      throw new Error(`apply_patch verification failed: ${error}`)
    }

    if (hunks.length === 0) {
      const normalized = params.patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      if (normalized === "*** Begin Patch\n*** End Patch") {
        throw new Error("patch rejected: empty patch")
      }
      throw new Error("apply_patch verification failed: no hunks found")
    }

    const fileChanges: FileChange[] = []

    for (const hunk of hunks) {
      const filePath = path.resolve(Instance.directory, hunk.path)
      await assertExternalDirectory(ctx, filePath)

      switch (hunk.type) {
        case "add": {
          const oldContent = ""
          const newContent =
            hunk.contents.length === 0 || hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: "add",
          })
          break
        }

        case "update": {
          const stats = await fs.stat(filePath).catch(() => undefined)
          if (!stats || stats.isDirectory()) {
            throw new Error(`apply_patch verification failed: Failed to read file to update: ${filePath}`)
          }

          const oldContent = await fs.readFile(filePath, "utf8")
          let newContent = oldContent

          try {
            newContent = Patch.deriveNewContentsFromChunks(filePath, hunk.chunks).content
          } catch (error) {
            throw new Error(`apply_patch verification failed: ${error}`)
          }

          const movePath = hunk.move_path ? path.resolve(Instance.directory, hunk.move_path) : undefined
          if (movePath) {
            await assertExternalDirectory(ctx, movePath)
          }

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: hunk.move_path ? "move" : "update",
            movePath,
          })
          break
        }

        case "delete": {
          const oldContent = await fs.readFile(filePath, "utf8").catch((error) => {
            throw new Error(`apply_patch verification failed: ${error}`)
          })

          fileChanges.push({
            filePath,
            oldContent,
            newContent: "",
            type: "delete",
          })
          break
        }
      }
    }

    const permissionPaths = new Set<string>()
    for (const change of fileChanges) {
      permissionPaths.add(path.relative(Instance.worktree, change.filePath) || change.filePath)
      if (change.movePath) {
        permissionPaths.add(path.relative(Instance.worktree, change.movePath) || change.movePath)
      }
    }

    const files = fileChanges.map((change) => ({
      filePath: change.filePath,
      relativePath: path.relative(Instance.worktree, change.movePath ?? change.filePath),
      type: change.type,
      movePath: change.movePath,
      additions: Math.max(0, change.newContent.split("\n").length - change.oldContent.split("\n").length),
      deletions: Math.max(0, change.oldContent.split("\n").length - change.newContent.split("\n").length),
    }))

    await ctx.ask({
      permission: "edit",
      patterns: Array.from(permissionPaths),
      always: ["*"],
      metadata: {
        filepath: Array.from(permissionPaths).join(", "),
        patchText: params.patchText,
        files,
      },
    })

    for (const change of fileChanges) {
      switch (change.type) {
        case "add":
          await fs.mkdir(path.dirname(change.filePath), { recursive: true })
          await fs.writeFile(change.filePath, change.newContent, "utf8")
          break

        case "update":
          await fs.writeFile(change.filePath, change.newContent, "utf8")
          break

        case "move":
          if (!change.movePath) {
            throw new Error(`apply_patch verification failed: move target missing for ${change.filePath}`)
          }
          await fs.mkdir(path.dirname(change.movePath), { recursive: true })
          await fs.writeFile(change.movePath, change.newContent, "utf8")
          await fs.unlink(change.filePath)
          break

        case "delete":
          await fs.unlink(change.filePath)
          break
      }
    }

    const summaryLines = fileChanges.map((change) => {
      if (change.type === "add") {
        return `A ${path.relative(Instance.worktree, change.filePath)}`
      }
      if (change.type === "delete") {
        return `D ${path.relative(Instance.worktree, change.filePath)}`
      }
      const target = change.movePath ?? change.filePath
      return `M ${path.relative(Instance.worktree, target)}`
    })

    return {
      title: "apply_patch",
      metadata: {
        files,
      },
      output: `Success. Updated the following files:\n${summaryLines.join("\n")}`,
    }
  },
})
