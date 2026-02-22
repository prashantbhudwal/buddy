import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "../bus/bus-event.js"
import { GlobalBus } from "../bus/global.js"
import { Config, InvalidError, JsonError } from "../config/config.js"
import "../permission/next.js"
import { isAllowedDirectory, resolveDirectory } from "../project/directory.js"
import "../session/message-v2/events.js"
import "../session/session-info.js"
import { errorSession, logSession } from "../session/debug.js"

const SsePayload = z.object({
  directory: z.string(),
  payload: BusEvent.payloads(),
})

const ErrorResponse = z.object({
  error: z.string(),
})

export const GlobalRoutes = () =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Health check",
        description: "Check if the server is healthy.",
        operationId: "global.health",
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
    .get(
      "/event",
      describeRoute({
        summary: "Global events",
        description: "Subscribe to server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(SsePayload),
              },
            },
          },
        },
      }),
      async (c) => {
        const rawScope =
          c.req.query("directory") ?? c.req.header("x-buddy-directory") ?? c.req.header("x-opencode-directory")
        const scopedDirectory = rawScope ? resolveDirectory(rawScope) : undefined

        if (scopedDirectory && !isAllowedDirectory(scopedDirectory)) {
          return c.json({ error: "Directory is outside allowed roots" }, 403)
        }

        logSession("route.sse.connect", {
          ip: c.req.header("x-forwarded-for") ?? "unknown",
          directory: scopedDirectory ?? "global",
        })
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        return streamSSE(c, async (stream) => {
          await stream.writeSSE({
            data: JSON.stringify({
              directory: "global",
              payload: {
                type: "server.connected",
                properties: {},
              },
            }),
          })

          const heartbeat = setInterval(() => {
            stream
              .writeSSE({
                data: JSON.stringify({
                  directory: "global",
                  payload: {
                    type: "server.heartbeat",
                    properties: {},
                  },
                }),
              })
              .catch(() => {})
          }, 5_000)

          async function handleEvent(event: { directory?: string; payload: unknown }) {
            try {
              const eventDirectory = event.directory ?? "global"
              if (scopedDirectory) {
                if (eventDirectory !== "global" && eventDirectory !== scopedDirectory) {
                  return
                }
              } else if (eventDirectory !== "global") {
                return
              }

              const payload = event.payload as {
                type?: string
                properties?: Record<string, unknown>
              }
              const payloadType = payload?.type ?? "unknown"
              if (
                payloadType === "session.status" ||
                payloadType === "message.updated" ||
                payloadType === "message.part.updated" ||
                payloadType === "message.part.delta"
              ) {
                logSession("route.sse.event", {
                  directory: event.directory ?? "global",
                  type: payloadType,
                  sessionID: String(payload?.properties?.sessionID ?? ""),
                  messageID: String(payload?.properties?.messageID ?? ""),
                })
              }

              await stream.writeSSE({
                data: JSON.stringify({
                  directory: eventDirectory,
                  payload: event.payload,
                }),
              })
            } catch (error) {
              errorSession("route.sse.write_failed", error)
            }
          }

          GlobalBus.on("event", handleEvent)
          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              logSession("route.sse.abort")
              clearInterval(heartbeat)
              GlobalBus.off("event", handleEvent)
              resolve()
            })
          })
        })
      },
    )
    .get(
      "/global/config",
      describeRoute({
        summary: "Get global config",
        description: "Retrieve global Buddy config.",
        operationId: "global.config.get",
        responses: {
          200: {
            description: "Global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.getGlobal())
      },
    )
    .patch(
      "/global/config",
      describeRoute({
        summary: "Patch global config",
        description: "Update global Buddy config and dispose active instances.",
        operationId: "global.config.update",
        responses: {
          200: {
            description: "Updated global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          400: {
            description: "Invalid config",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        try {
          const body = c.req.valid("json")
          const next = await Config.updateGlobal(body)
          return c.json(next)
        } catch (error) {
          if (error instanceof JsonError || error instanceof InvalidError) {
            return c.json({ error: error.message }, 400)
          }
          throw error
        }
      },
    )
