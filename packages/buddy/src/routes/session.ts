import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Bus } from "../bus/index.js"
import { WithParts } from "../session/message-v2/index.js"
import { SessionPrompt } from "../session/prompt.js"
import { SessionInfo } from "../session/session-info.js"
import { SessionStore } from "../session/session-store.js"
import { errorSession, logSession, stringifyError } from "../session/debug.js"

const ErrorResponse = z.object({
  error: z.string(),
})

export const SessionRoutes = () =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List sessions",
        description: "List sessions for the current project directory.",
        operationId: "session.list",
        responses: {
          200: {
            description: "Sessions",
            content: {
              "application/json": {
                schema: resolver(z.array(SessionInfo.Info)),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        return c.json(SessionStore.list({ limit: query.limit }))
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create session",
        description: "Create a new chat session.",
        operationId: "session.create",
        responses: {
          200: {
            description: "Session created",
            content: {
              "application/json": {
                schema: resolver(SessionInfo.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const info = SessionStore.create()
        logSession("route.session.create", { sessionID: info.id })
        await Bus.publish(SessionInfo.Event.Created, { info })
        return c.json(info)
      },
    )
    .get(
      "/:sessionID",
      describeRoute({
        summary: "Get session",
        description: "Get a session by ID.",
        operationId: "session.get",
        responses: {
          200: {
            description: "Session",
            content: {
              "application/json": {
                schema: resolver(SessionInfo.Info),
              },
            },
          },
          404: {
            description: "Session not found",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        logSession("route.session.get", { sessionID })
        const info = SessionStore.get(sessionID)
        if (!info) {
          logSession("route.session.get.not_found", { sessionID })
          return c.json({ error: "Session not found" }, 404)
        }
        return c.json(info)
      },
    )
    .get(
      "/:sessionID/message",
      describeRoute({
        summary: "List messages",
        description: "List all messages in a session.",
        operationId: "session.messages",
        responses: {
          200: {
            description: "Messages",
            content: {
              "application/json": {
                schema: resolver(z.array(WithParts)),
              },
            },
          },
          404: {
            description: "Session not found",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        logSession("route.session.messages", { sessionID })
        const info = SessionStore.get(sessionID)
        if (!info) {
          logSession("route.session.messages.not_found", { sessionID })
          return c.json({ error: "Session not found" }, 404)
        }
        return c.json(SessionStore.listMessages(sessionID))
      },
    )
    .post(
      "/:sessionID/message",
      describeRoute({
        summary: "Send message",
        description: "Append a user message and start assistant processing.",
        operationId: "session.prompt",
        responses: {
          200: {
            description: "Assistant message scaffold",
            content: {
              "application/json": {
                schema: resolver(WithParts),
              },
            },
          },
          404: {
            description: "Session not found",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
          409: {
            description: "Session is already running",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          content: z.string().min(1),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        logSession("route.session.prompt", {
          sessionID,
          contentLength: body.content.length,
        })

        if (!SessionStore.get(sessionID)) {
          logSession("route.session.prompt.not_found", { sessionID })
          return c.json({ error: "Session not found" }, 404)
        }

        try {
          const result = await SessionPrompt.prompt({
            sessionID,
            content: body.content,
          })
          logSession("route.session.prompt.accepted", {
            sessionID,
            assistantMessageID: result.info.id,
          })
          return c.json(result)
        } catch (error) {
          if (String(error).includes("already running")) {
            logSession("route.session.prompt.busy", { sessionID })
            return c.json({ error: "Session is already running" }, 409)
          }
          errorSession("route.session.prompt.failed", error, { sessionID })
          return c.json({ error: stringifyError(error) }, 500)
        }
      },
    )
    .post(
      "/:sessionID/abort",
      describeRoute({
        summary: "Abort session",
        description: "Abort current assistant generation.",
        operationId: "session.abort",
        responses: {
          200: {
            description: "Abort status",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          404: {
            description: "Session not found",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        logSession("route.session.abort", { sessionID })
        if (!SessionStore.get(sessionID)) {
          logSession("route.session.abort.not_found", { sessionID })
          return c.json({ error: "Session not found" }, 404)
        }
        const aborted = await SessionPrompt.abort(sessionID)
        logSession("route.session.abort.result", { sessionID, aborted })
        return c.json(aborted)
      },
    )
