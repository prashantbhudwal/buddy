import fs from "node:fs"
import path from "node:path"
import z from "zod"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"

const PermissionAction = z.enum(["allow", "ask", "deny"])
const PermissionObject = z.record(z.string(), PermissionAction)
const PermissionRule = z.union([PermissionAction, PermissionObject])

const Permission = z
  .union([PermissionAction, z.record(z.string(), PermissionRule)])
  .transform((value) =>
    typeof value === "string" ? ({ "*": value } as Record<string, z.infer<typeof PermissionRule>>) : value,
  )

const ConfigFile = z
  .object({
    permission: Permission.optional(),
  })
  .passthrough()

type PermissionAction = z.infer<typeof PermissionAction>

export namespace PermissionConfig {
  export type Action = PermissionAction
  export type Rule = z.infer<typeof PermissionRule>
  export type Shape = z.infer<typeof Permission>

  const GLOBAL_CONFIG_FILES = ["buddy.jsonc", "buddy.json", "config.jsonc", "config.json"]
  const PROJECT_CONFIG_FILES = [
    ".buddy/config.jsonc",
    ".buddy/config.json",
    ".buddy/permission.jsonc",
    ".buddy/permission.json",
  ]

  function stripJsonComments(content: string) {
    const withoutBlock = content.replace(/\/\*[\s\S]*?\*\//g, "")
    return withoutBlock
      .split("\n")
      .map((line) => {
        const match = /(^|[^:])\/\//.exec(line)
        if (!match) return line
        return line.slice(0, match.index + match[1].length)
      })
      .join("\n")
  }

  function readConfigFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
      return undefined
    }

    const content = fs.readFileSync(filePath, "utf8")
    const parsed = JSON.parse(stripJsonComments(content)) as unknown
    return ConfigFile.parse(parsed)
  }

  function findNearestProjectConfig(directory: string, worktree: string) {
    let current = path.resolve(directory)
    const stop = path.resolve(worktree)

    while (true) {
      for (const relativePath of PROJECT_CONFIG_FILES) {
        const candidate = path.join(current, relativePath)
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }

      if (current === stop) {
        return undefined
      }

      const parent = path.dirname(current)
      if (parent === current) {
        return undefined
      }
      current = parent
    }
  }

  function mergeRule(base: Rule | undefined, override: Rule | undefined): Rule | undefined {
    if (override === undefined) return base
    if (base === undefined) return override

    if (typeof base === "object" && typeof override === "object") {
      return {
        ...base,
        ...override,
      }
    }

    return override
  }

  export function merge(base: Shape, override: Shape): Shape {
    const next: Record<string, Rule> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      next[key] = mergeRule(next[key], value) as Rule
    }
    return next
  }

  export function fromObject(input: unknown) {
    return Permission.parse(input)
  }

  export function load() {
    let merged = fromObject({})

    for (const filename of GLOBAL_CONFIG_FILES) {
      const absolute = path.join(Global.Path.config, filename)
      const parsed = readConfigFile(absolute)
      if (!parsed?.permission) continue
      merged = merge(merged, parsed.permission)
    }

    const projectConfig = findNearestProjectConfig(Instance.directory, Instance.worktree)
    if (projectConfig) {
      const parsed = readConfigFile(projectConfig)
      if (parsed?.permission) {
        merged = merge(merged, parsed.permission)
      }
    }

    return merged
  }
}
