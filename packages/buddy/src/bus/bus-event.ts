import z from "zod"
import type { ZodType } from "zod"

export namespace BusEvent {
  export type Definition = ReturnType<typeof define>

  const registry = new Map<string, Definition>()

  export function define<Type extends string, Properties extends ZodType>(
    type: Type,
    properties: Properties,
  ) {
    const result = {
      type,
      properties,
    }
    registry.set(type, result)
    return result
  }

  export function payloads() {
    const variants = Array.from(registry.entries()).map(([type, def]) =>
      z.object({
        type: z.literal(type),
        properties: def.properties,
      }),
    )

    if (variants.length === 0) {
      return z.object({
        type: z.string(),
        properties: z.unknown(),
      })
    }

    if (variants.length === 1) {
      return variants[0]
    }

    return z.discriminatedUnion("type", variants as [any, any, ...any[]])
  }
}
