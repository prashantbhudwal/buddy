import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"

const items: Array<{
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}> = []

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ItemRoutes = () =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List all items",
        description: "Get a list of all items",
        operationId: "items.list",
        responses: {
          200: {
            description: "List of items",
            content: {
              "application/json": {
                schema: resolver(z.array(ItemSchema)),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(items)
      },
    )
    .get(
      "/:id",
      describeRoute({
        summary: "Get an item",
        description: "Get a single item by ID",
        operationId: "items.get",
        responses: {
          200: {
            description: "Item found",
            content: {
              "application/json": {
                schema: resolver(ItemSchema),
              },
            },
          },
          404: {
            description: "Item not found",
          },
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const item = items.find((i) => i.id === id)
        if (!item) {
          return c.json({ error: "Item not found" }, 404)
        }
        return c.json(item)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create an item",
        description: "Create a new item",
        operationId: "items.create",
        responses: {
          201: {
            description: "Item created",
            content: {
              "application/json": {
                schema: resolver(ItemSchema),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
          description: z.string().optional(),
        }),
      ),
      async (c) => {
        const data = c.req.valid("json")
        const now = new Date().toISOString()
        const item = {
          id: `item-${Date.now()}`,
          name: data.name,
          description: data.description,
          createdAt: now,
          updatedAt: now,
        }
        items.push(item)
        return c.json(item, 201)
      },
    )
    .patch(
      "/:id",
      describeRoute({
        summary: "Update an item",
        description: "Update an existing item",
        operationId: "items.update",
        responses: {
          200: {
            description: "Item updated",
            content: {
              "application/json": {
                schema: resolver(ItemSchema),
              },
            },
          },
          404: {
            description: "Item not found",
          },
        },
      }),
      validator("param", z.object({ id: z.string() })),
      validator(
        "json",
        z.object({
          name: z.string().optional(),
          description: z.string().optional(),
        }),
      ),
      async (c) => {
        const { id } = c.req.valid("param")
        const data = c.req.valid("json")
        const index = items.findIndex((i) => i.id === id)
        if (index === -1) {
          return c.json({ error: "Item not found" }, 404)
        }
        items[index] = {
          ...items[index],
          ...data,
          updatedAt: new Date().toISOString(),
        }
        return c.json(items[index])
      },
    )
    .delete(
      "/:id",
      describeRoute({
        summary: "Delete an item",
        description: "Delete an item by ID",
        operationId: "items.delete",
        responses: {
          204: {
            description: "Item deleted",
          },
          404: {
            description: "Item not found",
          },
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const index = items.findIndex((i) => i.id === id)
        if (index === -1) {
          return c.json({ error: "Item not found" }, 404)
        }
        items.splice(index, 1)
        return c.body(null, 204)
      },
    )
