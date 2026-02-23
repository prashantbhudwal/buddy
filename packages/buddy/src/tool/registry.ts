import type { Agent } from "../agent/agent.js"
import { PermissionNext } from "../permission/next.js"
import { ApplyPatchTool } from "./apply_patch.js"
import { BashTool } from "./bash.js"
import { CurriculumReadTool } from "./curriculum-read.js"
import { CurriculumUpdateTool } from "./curriculum-update.js"
import { EditTool } from "./edit.js"
import { GlobTool } from "./glob.js"
import { GrepTool } from "./grep.js"
import { InvalidTool } from "./invalid.js"
import { ListTool } from "./list.js"
import { ReadTool } from "./read.js"
import { TaskTool } from "./task.js"
import type { Tool } from "./tool.js"
import { WebFetchTool } from "./webfetch.js"
import { WriteTool } from "./write.js"

const builtins: Tool.Info[] = [
  InvalidTool,
  BashTool,
  ReadTool,
  ListTool,
  GlobTool,
  GrepTool,
  EditTool,
  ApplyPatchTool,
  WriteTool,
  WebFetchTool,
  TaskTool,
  CurriculumReadTool,
  CurriculumUpdateTool,
]

export namespace ToolRegistry {
  export async function ids() {
    return builtins.map((tool) => tool.id)
  }

  export async function tools(input?: {
    model?: {
      providerID: string
      modelID: string
    }
    agent?: Agent.Info
  }): Promise<any[]> {
    const agent = input?.agent
    const disabled = agent ? PermissionNext.disabled(builtins.map((tool) => tool.id), agent.permission) : new Set<string>()

    const initialized = await Promise.all(
      builtins
        .filter((tool) => tool.id === "invalid" || !disabled.has(tool.id))
        .map(async (tool) => ({
          id: tool.id,
          ...(await tool.init({ agent })),
        })),
    )

    return initialized
  }
}
