#!/usr/bin/env bun
import { createClient } from "@hey-api/openapi-ts"

// Generate SDK from running backend
const API_URL = process.env.API_URL || "http://localhost:3000/doc"

console.log(`Generating SDK from ${API_URL}...`)

await createClient({
  input: API_URL,
  output: "src",
  plugins: [
    {
      name: "@hey-api/client-fetch",
      baseUrl: "http://localhost:3000/api",
    },
  ],
})

console.log("✅ SDK generated successfully!")
