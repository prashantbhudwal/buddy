import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import { afterAll } from "bun:test"

const dir = path.join(os.tmpdir(), `buddy-test-data-${process.pid}`)
await fs.mkdir(dir, { recursive: true })

afterAll(() => {
  fsSync.rmSync(dir, { recursive: true, force: true })
})

process.env["BUDDY_DATA_DIR"] = path.join(dir, "data")
process.env["BUDDY_CACHE_DIR"] = path.join(dir, "cache")
process.env["BUDDY_GLOBAL_CONFIG_DIR"] = path.join(dir, "config")
process.env["BUDDY_STATE_DIR"] = path.join(dir, "state")
process.env["BUDDY_TEST_HOME"] = path.join(dir, "home")

await fs.mkdir(process.env["BUDDY_DATA_DIR"], { recursive: true })
await fs.mkdir(process.env["BUDDY_CACHE_DIR"], { recursive: true })
await fs.mkdir(process.env["BUDDY_GLOBAL_CONFIG_DIR"], { recursive: true })
await fs.mkdir(process.env["BUDDY_STATE_DIR"], { recursive: true })
await fs.mkdir(process.env["BUDDY_TEST_HOME"], { recursive: true })
