import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { PermissionNext } from "../permission/next.js"

export const PermissionRoutes = () =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List pending permissions",
        description: "List pending permission requests for the current project scope.",
        operationId: "permission.list",
        responses: {
          200: {
            description: "Pending permission requests",
            content: {
              "application/json": {
                schema: resolver(z.array(PermissionNext.Request)),
              },
            },
          },
        },
      }),
      async (c) => {
        const requests = await PermissionNext.list()
        return c.json(requests)
      },
    )
    .post(
      "/:requestID/reply",
      describeRoute({
        summary: "Reply to a permission request",
        description: "Approve or reject a pending permission request.",
        operationId: "permission.reply",
        responses: {
          200: {
            description: "Reply accepted",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          requestID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          reply: PermissionNext.Reply,
          message: z.string().optional(),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        const ok = await PermissionNext.reply({
          requestID: params.requestID,
          reply: body.reply,
          message: body.message,
        })
        return c.json(ok)
      },
    )
