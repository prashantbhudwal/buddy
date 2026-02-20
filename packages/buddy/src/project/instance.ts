import path from "path"
import { AsyncLocalStorage } from "node:async_hooks"

type Context = {
  directory: string
}

const context = new AsyncLocalStorage<Context>()
const cache = new Map<string, Promise<Context>>()
const stateByDirectory = new Map<string, Map<string, unknown>>()

function normalizeDirectory(directory: string) {
  return path.resolve(directory)
}

async function resolveContext(input: {
  directory: string
  init?: () => Promise<void>
}) {
  const normalized = normalizeDirectory(input.directory)
  let existing = cache.get(normalized)
  if (!existing) {
    existing = (async () => {
      stateByDirectory.set(normalized, stateByDirectory.get(normalized) ?? new Map())
      if (input.init) {
        await context.run({ directory: normalized }, input.init)
      }
      return { directory: normalized }
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
    return context.getStore()?.directory ?? process.cwd()
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
}

