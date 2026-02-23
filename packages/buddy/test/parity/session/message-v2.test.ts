import { describe, expect, test } from "bun:test"
import {
  User,
  Assistant,
  WithParts,
  toModelMessages,
} from "../../../src/session/message-v2/index.js"

describe("parity.session.message-v2", () => {
  test("validates user and assistant message envelopes", () => {
    const user = User.parse({
      id: "message_user_1",
      sessionID: "session_1",
      role: "user",
      time: { created: Date.now() },
    })
    expect(user.role).toBe("user")

    const assistant = Assistant.parse({
      id: "message_assistant_1",
      sessionID: "session_1",
      role: "assistant",
      agent: "build",
      time: { created: Date.now() },
      cost: 0,
      tokens: {
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    })
    expect(assistant.role).toBe("assistant")
  })

  test("converts tool output to model messages", () => {
    const history = [
      WithParts.parse({
        info: {
          id: "m_user",
          sessionID: "session_1",
          role: "user",
          time: { created: 1 },
        },
        parts: [
          {
            id: "p_user",
            sessionID: "session_1",
            messageID: "m_user",
            type: "text",
            text: "run list",
          },
        ],
      }),
      WithParts.parse({
        info: {
          id: "m_assistant",
          sessionID: "session_1",
          role: "assistant",
          agent: "build",
          time: { created: 2 },
          cost: 0,
          tokens: {
            total: 10,
            input: 5,
            output: 5,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
        parts: [
          {
            id: "p_tool",
            sessionID: "session_1",
            messageID: "m_assistant",
            type: "tool",
            tool: "list",
            callID: "call_1",
            state: {
              status: "completed",
              input: {},
              output: "file-a\nfile-b",
              time: { start: 2, end: 3 },
            },
          },
        ],
      }),
    ]

    const modelMessages = toModelMessages(history)
    expect(modelMessages.length).toBeGreaterThan(0)
  })
})
