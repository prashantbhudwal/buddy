import { describe, expect, test } from "bun:test"
import { isOverflow } from "../../../src/session/compaction.js"

describe("parity.session.compaction", () => {
  test("detects overflow when usage exceeds usable window", async () => {
    const overflow = await isOverflow({
      sessionID: "session_overflow",
      contextLimit: 100_000,
      maxOutput: 8_000,
      lastUsageTotal: 90_001,
    })

    expect(overflow).toBe(true)
  })

  test("does not overflow below threshold", async () => {
    const overflow = await isOverflow({
      sessionID: "session_safe",
      contextLimit: 100_000,
      maxOutput: 8_000,
      lastUsageTotal: 30_000,
    })

    expect(overflow).toBe(false)
  })
})
