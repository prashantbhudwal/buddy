import { Instance } from "../../src/project/instance.js"
import { tmpdir } from "../fixture/fixture"

export async function withRepo<T>(fn: (directory: string) => Promise<T>) {
  await using tmp = await tmpdir({ git: true })
  return await fn(tmp.path)
}

export function inDirectory<T>(directory: string, fn: () => Promise<T> | T) {
  return Instance.provide({
    directory,
    fn,
  })
}
