import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { Config } from "../config/config.js"
import { Flag } from "../flag/flag.js"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"
import type { MessageWithParts } from "./message-v2/index.js"

const FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"] as const

const state = Instance.state("instruction", () => ({
  claims: new Map<string, Set<string>>(),
}))

async function exists(filepath: string) {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false)
}

async function findUp(target: string, start: string, stop?: string) {
  const result: string[] = []
  let current = path.resolve(start)
  const end = stop ? path.resolve(stop) : undefined

  while (true) {
    const candidate = path.join(current, target)
    if (await exists(candidate)) result.push(candidate)

    if (end && current === end) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return result
}

async function scanPattern(pattern: string, cwd: string) {
  const matches: string[] = []
  const glob = new Bun.Glob(pattern)
  for await (const item of glob.scan({ cwd, absolute: true })) {
    matches.push(item)
  }
  return matches
}

function globalFiles() {
  const files: string[] = []
  if (Flag.BUDDY_CONFIG_DIR) {
    files.push(path.join(Flag.BUDDY_CONFIG_DIR, "AGENTS.md"))
  }
  files.push(path.join(Global.Path.config, "AGENTS.md"))
  if (!Flag.BUDDY_DISABLE_CLAUDE_CODE_PROMPT) {
    files.push(path.join(os.homedir(), ".claude", "CLAUDE.md"))
  }
  return files
}

async function resolveRelative(instruction: string): Promise<string[]> {
  if (!Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
    return findUp(instruction, Instance.directory, Instance.worktree).catch(() => [])
  }

  if (!Flag.BUDDY_CONFIG_DIR) {
    return []
  }

  return findUp(instruction, Flag.BUDDY_CONFIG_DIR, Flag.BUDDY_CONFIG_DIR).catch(() => [])
}

function isClaimed(messageID: string, filepath: string) {
  const claimed = state().claims.get(messageID)
  if (!claimed) return false
  return claimed.has(filepath)
}

function claim(messageID: string, filepath: string) {
  const current = state()
  let claimed = current.claims.get(messageID)
  if (!claimed) {
    claimed = new Set()
    current.claims.set(messageID, claimed)
  }
  claimed.add(filepath)
}

async function findInstructionFile(dir: string) {
  for (const file of FILES) {
    const filepath = path.resolve(path.join(dir, file))
    if (await exists(filepath)) return filepath
  }
}

export function clearClaimed(messageID: string) {
  state().claims.delete(messageID)
}

export async function systemPaths() {
  const config = await Config.get()
  const paths = new Set<string>()

  if (!Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
    for (const file of FILES) {
      const matches = await findUp(file, Instance.directory, Instance.worktree)
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

  for (let instruction of config.instructions ?? []) {
    if (instruction.startsWith("https://") || instruction.startsWith("http://")) continue

    if (instruction.startsWith("~/")) {
      instruction = path.join(os.homedir(), instruction.slice(2))
    }

    const matches = path.isAbsolute(instruction)
      ? await scanPattern(path.basename(instruction), path.dirname(instruction)).catch(() => [])
      : await resolveRelative(instruction)

    matches.forEach((item) => {
      paths.add(path.resolve(item))
    })
  }

  return paths
}

export async function system() {
  const config = await Config.get()
  const paths = await systemPaths()

  const files = Array.from(paths).map(async (filepath) => {
    const content = await fs.readFile(filepath, "utf8").catch(() => "")
    return content ? `Instructions from: ${filepath}\n${content}` : ""
  })

  const urls = (config.instructions ?? []).filter((instruction) => {
    return instruction.startsWith("https://") || instruction.startsWith("http://")
  })

  const fetches = urls.map((url) =>
    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => "")
      .then((content) => (content ? `Instructions from: ${url}\n${content}` : "")),
  )

  return Promise.all([...files, ...fetches]).then((result) => result.filter(Boolean))
}

export async function loadInstructions() {
  return system()
}

export function loaded(messages: MessageWithParts[]) {
  const paths = new Set<string>()

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== "read") continue
      if (part.state.status !== "completed") continue
      if (part.state.time.compacted) continue
      const loaded = part.state.metadata?.loaded
      if (!loaded || !Array.isArray(loaded)) continue
      for (const filepath of loaded) {
        if (typeof filepath === "string") paths.add(filepath)
      }
    }
  }

  return paths
}

export async function resolveDirectoryInstructions(input: {
  messages: MessageWithParts[]
  filepath: string
  messageID: string
}) {
  const systemSet = await systemPaths()
  const loadedSet = loaded(input.messages)
  const results: Array<{ filepath: string; content: string }> = []

  const target = path.resolve(input.filepath)
  let current = path.dirname(target)
  const root = path.resolve(Instance.directory)

  while (current.startsWith(root) && current !== root) {
    const found = await findInstructionFile(current)
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
        results.push({
          filepath: found,
          content: `Instructions from: ${found}\n${content}`,
        })
      }
    }

    current = path.dirname(current)
  }

  return results
}
