import path from "node:path"
import z from "zod"
import { PermissionConfig } from "../config/permission-config.js"
import { PermissionNext } from "../permission/next.js"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"
import { Truncate } from "../tool/truncation.js"
import CURRICULUM_BUILDER_PROMPT from "./prompts/curriculum-builder.txt"

export namespace Agent {
  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      permission: PermissionNext.Ruleset,
      model: z
        .object({
          modelID: z.string(),
          providerID: z.string(),
        })
        .optional(),
      variant: z.string().optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()).default({}),
      steps: z.number().int().positive().optional(),
    })

  export type Info = z.infer<typeof Info>

  function defaults() {
    return PermissionNext.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      external_directory: {
        "*": "ask",
        [Truncate.GLOB]: "allow",
        [path.join(Global.Path.data, "notebooks", "*")]: "allow",
      },
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
    })
  }

  const state = Instance.state("agent.catalog", () => {
    const userRules = PermissionNext.fromConfig(PermissionConfig.load())
    const base = defaults()

    const agents: Record<string, Info> = {
      build: {
        name: "build",
        description: "The default Buddy agent. Executes tools based on configured permissions.",
        permission: PermissionNext.merge(
          base,
          PermissionNext.fromConfig({
            question: "allow",
          }),
          userRules,
        ),
        mode: "primary",
        native: true,
        steps: 8,
        options: {},
      },
      "curriculum-builder": {
        name: "curriculum-builder",
        description: "Builds and updates project curriculum markdown with actionable checklists.",
        prompt: CURRICULUM_BUILDER_PROMPT,
        permission: PermissionNext.merge(
          base,
          PermissionNext.fromConfig({
            "*": "deny",
            read: "allow",
            list: "allow",
            write: "allow",
            webfetch: "allow",
            curriculum_read: "allow",
            curriculum_update: "allow",
            task: "deny",
          }),
          userRules,
        ),
        mode: "subagent",
        native: true,
        steps: 8,
        options: {},
      },
      general: {
        name: "general",
        description: "General-purpose subagent for research and multi-step execution.",
        permission: PermissionNext.merge(
          base,
          PermissionNext.fromConfig({
            todoread: "deny",
            todowrite: "deny",
            curriculum_read: "deny",
            curriculum_update: "deny",
          }),
          userRules,
        ),
        mode: "subagent",
        native: true,
        options: {},
      },
    }

    for (const [name, agent] of Object.entries(agents)) {
      const explicitDenyTruncate = agent.permission.some(
        (rule) => rule.permission === "external_directory" && rule.action === "deny" && rule.pattern === Truncate.GLOB,
      )
      if (explicitDenyTruncate) continue
      agents[name].permission = PermissionNext.merge(
        agents[name].permission,
        PermissionNext.fromConfig({
          external_directory: {
            [Truncate.GLOB]: "allow",
          },
        }),
      )
    }

    return agents
  })

  export async function get(name: string) {
    return state()[name]
  }

  export async function list() {
    return Object.values(state()).sort((left, right) => {
      const leftPriority = left.name === "build" ? 0 : 1
      const rightPriority = right.name === "build" ? 0 : 1
      return leftPriority - rightPriority
    })
  }

  export async function defaultAgent() {
    const agents = state()
    if (agents.build && agents.build.mode !== "subagent" && agents.build.hidden !== true) {
      return agents.build.name
    }

    const fallback = Object.values(agents).find((agent) => agent.mode !== "subagent" && agent.hidden !== true)
    if (!fallback) {
      throw new Error("No primary agent found")
    }

    return fallback.name
  }
}
