import z from "zod"
import { CurriculumPath } from "../curriculum/curriculum-path.js"
import { CurriculumService } from "../curriculum/curriculum-service.js"
import { Tool } from "./tool.js"

export const CurriculumReadTool = Tool.define("curriculum_read", {
  description: "Read the current project curriculum markdown document.",
  parameters: z.object({}),
  async execute(_params, ctx) {
    const path = CurriculumPath.file()

    await ctx.ask({
      permission: "curriculum_read",
      patterns: [path],
      always: ["*"],
      metadata: {
        path,
      },
    })

    const current = await CurriculumService.read()

    return {
      title: "curriculum.md",
      output: current.markdown,
      metadata: {
        path: current.path,
      },
    }
  },
})
