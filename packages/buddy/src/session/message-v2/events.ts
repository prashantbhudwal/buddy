import z from "zod"
import { BusEvent } from "../../bus/bus-event.js"
import { Info } from "./messages.js"
import { Part } from "./parts.js"

export const MessageEvents = {
  Updated: BusEvent.define(
    "message.updated",
    z.object({
      info: Info,
    }),
  ),
  Removed: BusEvent.define(
    "message.removed",
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
    }),
  ),
  PartUpdated: BusEvent.define(
    "message.part.updated",
    z.object({
      part: Part,
    }),
  ),
  PartDelta: BusEvent.define(
    "message.part.delta",
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
      partID: z.string(),
      field: z.string(),
      delta: z.string(),
    }),
  ),
  PartRemoved: BusEvent.define(
    "message.part.removed",
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
      partID: z.string(),
    }),
  ),
}

