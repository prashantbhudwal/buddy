export function makeToolContext() {
  return {
    sessionID: "session_test_tools",
    messageID: "message_test_tools",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => undefined,
    ask: async () => undefined,
  } as any
}
