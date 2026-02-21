import z from "zod"
import type { MessageWithParts } from "../session/message-v2/index.js"
import { Truncate } from "./truncation.js"

export namespace Tool {
  interface Metadata {
    [key: string]: any
  }

  export interface InitContext {
    agent?: {
      name: string
      permission: Array<{
        permission: string
        pattern: string
        action: "allow" | "ask" | "deny"
      }>
    }
  }

  export type AskRequest = {
    permission: string
    patterns: string[]
    always: string[]
    metadata: Record<string, unknown>
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: Record<string, unknown>
    messages: MessageWithParts[]
    metadata(input: { title?: string; metadata?: M }): void | Promise<void>
    ask(input: AskRequest): Promise<void>
  }

  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (
      ctx?: InitContext,
    ) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: Array<{
          type: "file"
          mime: string
          filename?: string
          url: string
        }>
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo = init instanceof Function ? await init(initCtx) : init
        const execute = toolInfo.execute

        toolInfo.execute = async (args, ctx) => {
          try {
            toolInfo.parameters.parse(args)
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), { cause: error })
            }
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}. Rewrite the input to satisfy the schema.`,
              { cause: error },
            )
          }

          const result = await execute(args, ctx)

          if (result.metadata && (result.metadata as Record<string, unknown>).truncated !== undefined) {
            return result
          }

          const truncated = await Truncate.output(result.output, {})
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated ? { outputPath: truncated.outputPath } : {}),
            },
          }
        }

        return toolInfo
      },
    }
  }
}
