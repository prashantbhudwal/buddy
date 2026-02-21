import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Tool } from "./tool.js"
import { Instance } from "../project/instance.js"
import { assertExternalDirectory } from "./external-directory.js"
import DESCRIPTION from "./write.txt"

export const WriteTool = Tool.define("write", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("Absolute or relative path to the file to write."),
    content: z.string().describe("File content."),
  }),
  async execute(params, ctx) {
    const filepath = path.isAbsolute(params.filePath)
      ? path.normalize(params.filePath)
      : path.resolve(Instance.directory, params.filePath)

    await assertExternalDirectory(ctx, filepath)

    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Instance.worktree, filepath) || filepath],
      always: ["*"],
      metadata: {
        filepath,
        bytes: Buffer.byteLength(params.content, "utf8"),
      },
    })

    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await fs.writeFile(filepath, params.content, "utf8")

    return {
      title: path.relative(Instance.worktree, filepath) || filepath,
      output: "Wrote file successfully.",
      metadata: {
        filepath,
      },
    }
  },
})
