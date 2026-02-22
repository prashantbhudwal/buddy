import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"
import type { MessageWithParts } from "./message-v2/index.js"

const FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"] as const
const GLOBAL_CONFIG_FILES = ["buddy.jsonc", "buddy.json", "config.jsonc", "config.json"]
const PROJECT_CONFIG_FILES = [
  ".buddy/config.jsonc",
  ".buddy/config.json",
  ".buddy/permission.jsonc",
  ".buddy/permission.json",
]

const state = Instance.state("instruction", () => ({
  claims: new Map<string, Set<string>>(),
}))

function isTruthyEnv(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

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

function stripTrailingCommas(content: string) {
  let result = ""
  let inString = false
  let escaped = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      result += char
      continue
    }

    if (char === ",") {
      let j = i + 1
      while (j < content.length && /\s/.test(content[j])) j += 1
      const next = content[j]
      if (next === "}" || next === "]") {
        continue
      }
    }

    result += char
  }

  return result
}

async function exists(filepath: string) {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false)
}

async function readConfigFile(filepath: string) {
  try {
    const present = await exists(filepath)
    if (!present) return undefined
    const content = await fs.readFile(filepath, "utf8")
    const json = stripTrailingCommas(stripJsonComments(content))
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== "object") return undefined
    const value = (parsed as Record<string, unknown>).instructions
    if (!value) return []
    if (typeof value === "string") return [value]
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === "string")
  } catch {
    return undefined
  }
}

async function findNearestProjectConfig() {
  let current = path.resolve(Instance.directory)
  const stop = path.resolve(Instance.worktree)

  while (true) {
    for (const relativePath of PROJECT_CONFIG_FILES) {
      const candidate = path.join(current, relativePath)
      if (await exists(candidate)) {
        return candidate
      }
    }
    if (current === stop) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}

async function loadConfigInstructions() {
  const result: string[] = []

  for (const filename of GLOBAL_CONFIG_FILES) {
    const candidate = path.join(Global.Path.config, filename)
    const instructions = await readConfigFile(candidate)
    if (!instructions || instructions.length === 0) continue
    result.push(...instructions)
  }

  const projectConfig = await findNearestProjectConfig()
  if (projectConfig) {
    const instructions = await readConfigFile(projectConfig)
    if (instructions && instructions.length > 0) {
      result.push(...instructions)
    }
  }

  return result
}

async function findUp(target: string, start: string, stop?: string) {
  let current = start
  const result: string[] = []
  while (true) {
    const search = path.join(current, target)
    if (await exists(search)) result.push(search)
    if (stop === current) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return result
}

async function resolveRelativeInstruction(instruction: string) {
  const disableProjectConfig = isTruthyEnv(process.env.BUDDY_DISABLE_PROJECT_CONFIG)
  const cfgDir = process.env.BUDDY_CONFIG_DIR

  if (disableProjectConfig) {
    if (!cfgDir) return []
    return findUp(instruction, path.resolve(cfgDir), path.resolve(cfgDir))
  }

  return findUp(instruction, path.resolve(Instance.directory), path.resolve(Instance.worktree))
}

function globalFiles() {
  const files = []
  if (process.env.BUDDY_CONFIG_DIR) {
    files.push(path.join(process.env.BUDDY_CONFIG_DIR, "AGENTS.md"))
  }
  files.push(path.join(Global.Path.config, "AGENTS.md"))
  if (!isTruthyEnv(process.env.BUDDY_DISABLE_CLAUDE_CODE_PROMPT)) {
    files.push(path.join(os.homedir(), ".claude", "CLAUDE.md"))
  }
  return files
}

function isClaimed(messageID: string, filepath: string) {
  return state().claims.get(messageID)?.has(filepath) ?? false
}

function claim(messageID: string, filepath: string) {
  const current = state()
  let claimed = current.claims.get(messageID)
  if (!claimed) {
    claimed = new Set<string>()
    current.claims.set(messageID, claimed)
  }
  claimed.add(filepath)
}

export function clearClaimed(messageID: string) {
  state().claims.delete(messageID)
}

export async function systemPaths() {
  const paths = new Set<string>()
  const disableProjectConfig = isTruthyEnv(process.env.BUDDY_DISABLE_PROJECT_CONFIG)

  if (!disableProjectConfig) {
    for (const file of FILES) {
      const matches = await findUp(file, path.resolve(Instance.directory), path.resolve(Instance.worktree))
      if (matches.length > 0) {
        matches.forEach((item) => paths.add(path.resolve(item)))
        break
      }
    }
  }

  for (const file of globalFiles()) {
    if (await exists(file)) {
      paths.add(path.resolve(file))
      break
    }
  }

  const instructions = await loadConfigInstructions()
  for (let instruction of instructions) {
    if (instruction.startsWith("https://") || instruction.startsWith("http://")) continue

    if (instruction.startsWith("~/")) {
      instruction = path.join(os.homedir(), instruction.slice(2))
    }

    if (path.isAbsolute(instruction)) {
      if (await exists(instruction)) {
        paths.add(path.resolve(instruction))
      }
      continue
    }

    const matches = await resolveRelativeInstruction(instruction)
    matches.forEach((item) => paths.add(path.resolve(item)))
  }

  return paths
}

export async function loadInstructions() {
  return system()
}

export async function system() {
  const paths = await systemPaths()
  const local = await Promise.all(
    Array.from(paths).map(async (filepath) => {
      const content = await fs.readFile(filepath, "utf8").catch(() => "")
      return content ? `Instructions from: ${filepath}\n${content}` : ""
    }),
  )

  const urls = (await loadConfigInstructions()).filter(
    (instruction) => instruction.startsWith("https://") || instruction.startsWith("http://"),
  )
  const remote = await Promise.all(
    urls.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(5000) })
        .then((res) => (res.ok ? res.text() : ""))
        .catch(() => "")
        .then((content) => (content ? `Instructions from: ${url}\n${content}` : "")),
    ),
  )

  return [...local, ...remote].filter(Boolean)
}

export function loaded(messages: MessageWithParts[]) {
  const paths = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "read") continue
      if (part.state.status !== "completed") continue
      if (part.state.time.compacted) continue
      const loadedList = part.state.metadata?.loaded
      if (!loadedList || !Array.isArray(loadedList)) continue
      for (const filepath of loadedList) {
        if (typeof filepath === "string") paths.add(filepath)
      }
    }
  }
  return paths
}

async function find(dir: string) {
  for (const file of FILES) {
    const candidate = path.resolve(path.join(dir, file))
    if (await exists(candidate)) return candidate
  }
}

export async function resolveDirectoryInstructions(input: {
  messages: MessageWithParts[]
  filepath: string
  messageID: string
}) {
  const systemSet = await systemPaths()
  const loadedSet = loaded(input.messages)
  const result: Array<{ filepath: string; content: string }> = []

  const target = path.resolve(input.filepath)
  let current = path.dirname(target)
  const root = path.resolve(Instance.directory)

  while (current.startsWith(root) && current !== root) {
    const found = await find(current)
    if (
      found &&
      found !== target &&
      !systemSet.has(found) &&
      !loadedSet.has(found) &&
      !isClaimed(input.messageID, found)
    ) {
      claim(input.messageID, found)
      const content = await fs.readFile(found, "utf8").catch(() => "")
      if (content) {
        result.push({
          filepath: found,
          content: `Instructions from: ${found}\n${content}`,
        })
      }
    }
    current = path.dirname(current)
  }

  return result
}
