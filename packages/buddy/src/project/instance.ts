import path from "node:path"
import { AsyncLocalStorage } from "node:async_hooks"
import { Project } from "./project.js"

type Context = {
  directory: string
  worktree: string
  project: Project.Info
}

const context = new AsyncLocalStorage<Context>()
const cache = new Map<string, Promise<Context>>()
const stateByDirectory = new Map<string, Map<string, unknown>>()

const FALLBACK_PROJECT: Project.Info = {
  id: "global",
  worktree: "/",
  time: {
    created: 0,
    updated: 0,
  },
  sandboxes: [],
}

function normalizeDirectory(directory: string) {
  return path.resolve(directory)
}

function containsPath(basePath: string, targetPath: string) {
  const base = normalizeDirectory(basePath)
  const target = normalizeDirectory(targetPath)
  const relative = path.relative(base, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function resolveContext(input: {
  directory: string
  init?: () => Promise<void>
}) {
  const normalized = normalizeDirectory(input.directory)
  let existing = cache.get(normalized)
  if (!existing) {
    existing = (async () => {
      const { project, sandbox } = await Project.fromDirectory(normalized)
      const nextContext: Context = {
        directory: normalized,
        worktree: sandbox,
        project,
      }
      stateByDirectory.set(normalized, stateByDirectory.get(normalized) ?? new Map())
      if (input.init) {
        await context.run(nextContext, input.init)
      }
      return nextContext
    })()
    cache.set(normalized, existing)
  }
  return existing
}

export const Instance = {
  async provide<T>(input: {
    directory: string
    init?: () => Promise<void>
    fn: () => Promise<T> | T
  }) {
    const current = await resolveContext(input)
    return context.run(current, input.fn)
  },
  get directory() {
    return context.getStore()?.directory ?? normalizeDirectory(process.cwd())
  },
  get worktree() {
    return context.getStore()?.worktree ?? normalizeDirectory(process.cwd())
  },
  get project() {
    return context.getStore()?.project ?? FALLBACK_PROJECT
  },
  containsPath(filepath: string) {
    const normalized = normalizeDirectory(filepath)
    if (containsPath(Instance.directory, normalized)) return true
    if (Instance.worktree === "/") return false
    return containsPath(Instance.worktree, normalized)
  },
  state<T>(key: string, init: () => T) {
    return () => {
      const directory = Instance.directory
      const directoryState = stateByDirectory.get(directory) ?? new Map<string, unknown>()
      stateByDirectory.set(directory, directoryState)
      if (!directoryState.has(key)) {
        directoryState.set(key, init())
      }
      return directoryState.get(key) as T
    }
  },
  dispose(directory?: string) {
    const normalized = normalizeDirectory(directory ?? (context.getStore()?.directory ?? process.cwd()))
    stateByDirectory.delete(normalized)
    cache.delete(normalized)
  },
  disposeAll() {
    stateByDirectory.clear()
    cache.clear()
  },
}
