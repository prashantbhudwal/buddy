import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { CurriculumService } from "../curriculum/curriculum-service.js"

const CurriculumDocument = z.object({
  markdown: z.string(),
})

const ErrorResponse = z.object({
  error: z.string(),
})

export const CurriculumRoutes = () =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get curriculum",
        description: "Get the canonical curriculum markdown for the current project.",
        operationId: "curriculum.get",
        responses: {
          200: {
            description: "Curriculum markdown",
            content: {
              "application/json": {
                schema: resolver(CurriculumDocument),
              },
            },
          },
        },
      }),
      async (c) => {
        const doc = await CurriculumService.read()
        return c.json({ markdown: doc.markdown })
      },
    )
    .put(
      "/",
      describeRoute({
        summary: "Update curriculum",
        description: "Replace the canonical curriculum markdown for the current project.",
        operationId: "curriculum.put",
        responses: {
          200: {
            description: "Curriculum markdown",
            content: {
              "application/json": {
                schema: resolver(CurriculumDocument),
              },
            },
          },
          400: {
            description: "Invalid markdown",
            content: {
              "application/json": {
                schema: resolver(ErrorResponse),
              },
            },
          },
        },
      }),
      validator("json", CurriculumDocument),
      async (c) => {
        const body = c.req.valid("json")
        try {
          const doc = await CurriculumService.write(body.markdown)
          return c.json({ markdown: doc.markdown })
        } catch (error) {
          return c.json({ error: String(error instanceof Error ? error.message : error) }, 400)
        }
      },
    )
