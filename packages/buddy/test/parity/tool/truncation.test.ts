import { describe, expect, test } from "bun:test"
import { Truncate } from "../../../src/tool/truncation.js"

describe("parity.tool.truncation", () => {
  test("returns unmodified small output", async () => {
    const result = await Truncate.output("hello world", {
      maxBytes: 1024,
      maxLines: 20,
    })
    expect(result.truncated).toBe(false)
    expect(result.content).toBe("hello world")
  })

  test("stores full output when truncating", async () => {
    const content = Array.from({ length: 200 }, (_, index) => `line-${index}`).join("\n")
    const result = await Truncate.output(content, {
      maxLines: 10,
      maxBytes: 200,
    })
    expect(result.truncated).toBe(true)
    expect(result.content.includes("The full output was saved to")).toBe(true)
  })
})
