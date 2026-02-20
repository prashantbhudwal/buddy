import z from "zod"
import { BusEvent } from "../bus/bus-event.js"

export namespace SessionInfo {
  export const Info = z.object({
    id: z.string(),
    title: z.string(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })

  export type Info = z.infer<typeof Info>

  export const Event = {
    Created: BusEvent.define(
      "session.created",
      z.object({
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "session.updated",
      z.object({
        info: Info,
      }),
    ),
    Status: BusEvent.define(
      "session.status",
      z.object({
        sessionID: z.string(),
        status: z.enum(["busy", "idle"]),
      }),
    ),
  }
}

