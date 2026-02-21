import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "../bus/bus-event.js"
import { GlobalBus } from "../bus/global.js"
import "../permission/next.js"
import { isAllowedDirectory, resolveDirectory } from "../project/directory.js"
import "../session/message-v2/events.js"
import "../session/session-info.js"
import { errorSession, logSession } from "../session/debug.js"

const SsePayload = z.object({
  directory: z.string(),
  payload: BusEvent.payloads(),
})

export const GlobalRoutes = () =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Health check",
        description: "Check if the server is healthy.",
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
          c.req.query("directory") ??
          c.req.header("x-buddy-directory") ??
          c.req.header("x-opencode-directory")
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
