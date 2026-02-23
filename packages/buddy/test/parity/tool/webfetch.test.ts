import { describe, expect, test } from "bun:test"
import { WebFetchTool } from "../../../src/tool/webfetch.js"
import { inDirectory, withRepo } from "../helpers"
import { makeToolContext } from "./context"

describe("parity.tool.webfetch", () => {
  test("converts html responses to markdown format", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return new Response("<html><body><h1>Parity Fetch</h1><p>Hello world</p></body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      })
    }) as typeof fetch

    try {
      await withRepo(async (directory) => {
        await inDirectory(directory, async () => {
          const tool = await WebFetchTool.init()
          const result = await tool.execute(
            {
              url: "https://example.com",
              format: "markdown",
            },
            makeToolContext(),
          )
          expect(result.output).toContain("Parity Fetch")
          expect(result.output).toContain("Hello world")
        })
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
