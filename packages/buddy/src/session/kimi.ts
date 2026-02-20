import { createAnthropic } from "@ai-sdk/anthropic"

let kimiProvider: ReturnType<typeof createAnthropic> | undefined

function provider() {
  if (kimiProvider) {
    return kimiProvider
  }

  const apiKey = process.env.KIMI_API_KEY
  if (!apiKey) {
    throw new Error("KIMI_API_KEY is missing. Add it to the repo root .env file.")
  }

  kimiProvider = createAnthropic({
    apiKey,
    baseURL: "https://api.kimi.com/coding/v1",
  })

  return kimiProvider
}

export function kimiModel(): any {
  return provider()("k2p5")
}
