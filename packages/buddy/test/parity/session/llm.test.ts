import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { WithParts, type MessageWithParts } from "../../../src/session/message-v2/index.js"
import { inDirectory, withRepo } from "../helpers"

let streamAssistant: typeof import("../../../src/session/llm.js").streamAssistant
const captured: any[] = []

beforeAll(async () => {
  mock.module("ai", () => ({
    streamText: (input: unknown) => {
      captured.push(input)
      return {
        warnings: [],
      }
    },
    tool: (value: unknown) => value,
  }))

  const mod = await import("../../../src/session/llm.js")
  streamAssistant = mod.streamAssistant
})

beforeEach(() => {
  captured.length = 0
})

describe("parity.session.llm", () => {
  test("sends anthropic thinking options for k2p5 via provider transform", async () => {
    const previous = process.env.KIMI_API_KEY
    process.env.KIMI_API_KEY = "test-kimi-key"

    try {
      await withRepo(async (directory) => {
        await inDirectory(directory, async () => {
          const history: MessageWithParts[] = [
            WithParts.parse({
              info: {
                id: "message_1",
                sessionID: "session_1",
                role: "user",
                agent: "build",
                model: {
                  providerID: "anthropic",
                  modelID: "k2p5",
                },
                time: { created: Date.now() },
              },
              parts: [
                {
                  id: "part_1",
                  sessionID: "session_1",
                  messageID: "message_1",
                  type: "text",
                  text: "hello",
                },
              ],
            }),
          ]

          await streamAssistant({
            sessionID: "session_1",
            messageID: "message_2",
            history,
            abortSignal: new AbortController().signal,
            forceTextResponseOnly: true,
          })

          expect(captured.length).toBe(1)
          const input = captured[0] as {
            maxOutputTokens?: number
            providerOptions?: {
              anthropic?: {
                thinking?: {
                  type?: string
                  budgetTokens?: number
                }
              }
            }
          }
          expect(input.maxOutputTokens).toBe(32_000)
          expect(input.providerOptions?.anthropic?.thinking?.type).toBe("enabled")
          expect((input.providerOptions?.anthropic?.thinking?.budgetTokens ?? 0) > 0).toBe(true)
        })
      })
    } finally {
      if (previous === undefined) {
        delete process.env.KIMI_API_KEY
      } else {
        process.env.KIMI_API_KEY = previous
      }
    }
  })
})
