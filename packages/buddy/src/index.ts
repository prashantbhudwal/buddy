import { Hono } from "hono"
import { describeRoute, generateSpecs, resolver, openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import z from "zod"
import { ItemRoutes } from "./routes/items.js"

const app = new Hono()

app
  .use(logger())
  .use(cors({ origin: "*" }))
  .get(
    "/health",
    describeRoute({
      summary: "Health check",
      description: "Check if the server is healthy",
      operationId: "health.check",
      responses: {
        200: {
          description: "Server is healthy",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  status: z.literal("ok"),
                  timestamp: z.string(),
                }),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      return c.json({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })
    },
  )
  .route("/items", ItemRoutes())

// Add OpenAPI docs endpoint
app.get(
  "/doc",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Buddy API",
        version: "1.0.0",
        description: "Buddy API Documentation",
      },
      openapi: "3.1.1",
    },
  }),
)

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

console.log(`🚀 Server starting on http://localhost:${port}`)
console.log(`📚 API docs available at http://localhost:${port}/doc`)

export default {
  port,
  fetch: app.fetch,
}
