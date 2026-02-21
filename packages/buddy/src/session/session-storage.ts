import { and, asc, desc, eq } from "../storage/db.js"
import { Database } from "../storage/db.js"
import { Instance } from "../project/instance.js"
import { newSessionID } from "./id.js"
import { SessionInfo } from "./session-info.js"
import { MessageTable, PartTable, SessionTable } from "./session.sql.js"
import type { AssistantMessage, MessageInfo, MessagePart, MessageWithParts } from "./message-v2/index.js"

const SESSION_VERSION = "buddy-v1"

type MessageRow = typeof MessageTable.$inferSelect
type PartRow = typeof PartTable.$inferSelect
type SessionPermissionRule = {
  permission: string
  pattern: string
  action: "allow" | "ask" | "deny"
}
type SessionCreateInput = {
  parentID?: string
  title?: string
  permission?: SessionPermissionRule[]
}

function toSessionInfo(row: typeof SessionTable.$inferSelect): SessionInfo.Info {
  return {
    id: row.id,
    title: row.title,
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
  }
}

function toMessageInfo(row: MessageRow): MessageInfo {
  return {
    id: row.id,
    sessionID: row.session_id,
    ...(row.data as Record<string, unknown>),
  } as MessageInfo
}

function toPart(row: PartRow): MessagePart {
  return {
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
    ...(row.data as Record<string, unknown>),
  } as MessagePart
}

function partCreatedTime(part: MessagePart) {
  const time = (part as { time?: { start?: number; created?: number } }).time
  return time?.start ?? time?.created ?? Date.now()
}

function partUpdatedTime(part: MessagePart) {
  const time = (part as { time?: { start?: number; end?: number; created?: number } }).time
  return time?.end ?? time?.start ?? time?.created ?? Date.now()
}

function assertSessionRow(sessionID: string) {
  const row = Database.use((db) =>
    db
      .select()
      .from(SessionTable)
      .where(and(eq(SessionTable.id, sessionID), eq(SessionTable.project_id, Instance.project.id)))
      .get(),
  )
  if (!row) {
    throw new Error(`Session not found: ${sessionID}`)
  }
  return row
}

function assertMessageRow(sessionID: string, messageID: string) {
  const row = Database.use((db) =>
    db
      .select()
      .from(MessageTable)
      .where(and(eq(MessageTable.id, messageID), eq(MessageTable.session_id, sessionID)))
      .get(),
  )
  if (!row) {
    throw new Error(`Message not found: ${messageID}`)
  }
  return row
}

export namespace SessionStorage {
  export function list(input?: { limit?: number; directory?: string }) {
    const filters = [eq(SessionTable.project_id, Instance.project.id)]
    if (input?.directory) {
      filters.push(eq(SessionTable.directory, input.directory))
    }

    const rows = Database.use((db) => {
      const query = db.select().from(SessionTable).where(and(...filters)).orderBy(desc(SessionTable.time_updated))
      if (!input?.limit || input.limit <= 0) {
        return query.all()
      }
      return query.limit(input.limit).all()
    })

    return rows.map(toSessionInfo)
  }

  export function create(input?: SessionCreateInput) {
    const now = Date.now()
    const title = input?.title ?? "New chat"
    const info: SessionInfo.Info = {
      id: newSessionID(),
      title,
      time: {
        created: now,
        updated: now,
      },
    }

    Database.use((db) => {
      db.insert(SessionTable)
        .values({
          id: info.id,
          project_id: Instance.project.id,
          parent_id: input?.parentID ?? null,
          slug: info.id,
          directory: Instance.directory,
          title: info.title,
          version: SESSION_VERSION,
          share_url: null,
          summary_additions: null,
          summary_deletions: null,
          summary_files: null,
          summary_diffs: null,
          revert: null,
          permission: input?.permission ?? null,
          time_created: info.time.created,
          time_updated: info.time.updated,
          time_compacting: null,
          time_archived: null,
        })
        .run()
    })
    return info
  }

  export function get(sessionID: string) {
    const row = Database.use((db) =>
      db
        .select()
        .from(SessionTable)
        .where(and(eq(SessionTable.id, sessionID), eq(SessionTable.project_id, Instance.project.id)))
        .get(),
    )
    if (!row) return undefined
    return toSessionInfo(row)
  }

  export function getPermission(sessionID: string) {
    const row = Database.use((db) =>
      db
        .select()
        .from(SessionTable)
        .where(and(eq(SessionTable.id, sessionID), eq(SessionTable.project_id, Instance.project.id)))
        .get(),
    )
    if (!row) return []
    const value = row.permission
    if (!Array.isArray(value)) return []
    return value as Array<{
      permission: string
      pattern: string
      action: "allow" | "ask" | "deny"
    }>
  }

  export function setPermission(sessionID: string, permission: SessionPermissionRule[]) {
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .update(SessionTable)
        .set({
          permission,
          time_updated: now,
        })
        .where(and(eq(SessionTable.id, sessionID), eq(SessionTable.project_id, Instance.project.id)))
        .returning()
        .get(),
    )
    if (!row) {
      throw new Error(`Session not found: ${sessionID}`)
    }
    return toSessionInfo(row)
  }

  export function assert(sessionID: string) {
    return toSessionInfo(assertSessionRow(sessionID))
  }

  export function setTitle(sessionID: string, title: string) {
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .update(SessionTable)
        .set({
          title,
          time_updated: now,
        })
        .where(and(eq(SessionTable.id, sessionID), eq(SessionTable.project_id, Instance.project.id)))
        .returning()
        .get(),
    )
    if (!row) {
      throw new Error(`Session not found: ${sessionID}`)
    }
    return toSessionInfo(row)
  }

  export function touch(sessionID: string) {
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .update(SessionTable)
        .set({
          time_updated: now,
        })
        .where(and(eq(SessionTable.id, sessionID), eq(SessionTable.project_id, Instance.project.id)))
        .returning()
        .get(),
    )
    if (!row) {
      throw new Error(`Session not found: ${sessionID}`)
    }
    return toSessionInfo(row)
  }

  export function appendMessage(info: MessageInfo) {
    assertSessionRow(info.sessionID)
    const { id, sessionID, ...data } = info
    const created = info.time.created
    const updated = info.time.completed ?? info.time.created
    Database.use((db) => {
      db.insert(MessageTable)
        .values({
          id,
          session_id: sessionID,
          time_created: created,
          time_updated: updated,
          data,
        })
        .onConflictDoUpdate({
          target: MessageTable.id,
          set: {
            data,
            time_updated: updated,
          },
        })
        .run()
    })
    touch(sessionID)
    return getMessageWithParts(sessionID, info.id)
  }

  export function updateMessage(info: MessageInfo) {
    return appendMessage(info)
  }

  export function appendPart(part: MessagePart) {
    assertSessionRow(part.sessionID)
    assertMessageRow(part.sessionID, part.messageID)
    const { id, messageID, sessionID, ...data } = part
    Database.use((db) => {
      db.insert(PartTable)
        .values({
          id,
          message_id: messageID,
          session_id: sessionID,
          time_created: partCreatedTime(part),
          time_updated: partUpdatedTime(part),
          data,
        })
        .onConflictDoUpdate({
          target: PartTable.id,
          set: {
            data,
            time_updated: partUpdatedTime(part),
          },
        })
        .run()
    })
    touch(sessionID)
    return part
  }

  export function updatePart(part: MessagePart) {
    return appendPart(part)
  }

  export function updatePartDelta(input: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }) {
    assertSessionRow(input.sessionID)
    assertMessageRow(input.sessionID, input.messageID)

    const row = Database.use((db) =>
      db
        .select()
        .from(PartTable)
        .where(
          and(
            eq(PartTable.id, input.partID),
            eq(PartTable.session_id, input.sessionID),
            eq(PartTable.message_id, input.messageID),
          ),
        )
        .get(),
    )
    if (!row) {
      throw new Error(`Part not found: ${input.partID}`)
    }

    const nextData = { ...(row.data as Record<string, unknown>) }
    const current = nextData[input.field]
    if (typeof current !== "string") {
      throw new Error(`Part field "${input.field}" is not a string`)
    }
    nextData[input.field] = current + input.delta

    Database.use((db) => {
      db.update(PartTable)
        .set({
          data: nextData as Omit<MessagePart, "id" | "sessionID" | "messageID">,
          time_updated: Date.now(),
        })
        .where(eq(PartTable.id, row.id))
        .run()
    })
    touch(input.sessionID)

    return {
      ...nextData,
      id: row.id,
      messageID: row.message_id,
      sessionID: row.session_id,
    } as MessagePart
  }

  export function getMessageWithParts(sessionID: string, messageID: string) {
    assertSessionRow(sessionID)

    const messageRow = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(and(eq(MessageTable.id, messageID), eq(MessageTable.session_id, sessionID)))
        .get(),
    )
    if (!messageRow) {
      return undefined
    }

    const partRows = Database.use((db) =>
      db
        .select()
        .from(PartTable)
        .where(and(eq(PartTable.message_id, messageID), eq(PartTable.session_id, sessionID)))
        .orderBy(asc(PartTable.id))
        .all(),
    )

    return {
      info: toMessageInfo(messageRow),
      parts: partRows.map(toPart),
    } as MessageWithParts
  }

  export function listMessages(sessionID: string) {
    assertSessionRow(sessionID)

    const messageRows = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionID))
        .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
        .all(),
    )
    const partRows = Database.use((db) =>
      db
        .select()
        .from(PartTable)
        .where(eq(PartTable.session_id, sessionID))
        .orderBy(asc(PartTable.message_id), asc(PartTable.id))
        .all(),
    )

    const partsByMessage = new Map<string, MessagePart[]>()
    for (const partRow of partRows) {
      const part = toPart(partRow)
      const existing = partsByMessage.get(part.messageID)
      if (existing) {
        existing.push(part)
      } else {
        partsByMessage.set(part.messageID, [part])
      }
    }

    return messageRows.map((messageRow) => ({
      info: toMessageInfo(messageRow),
      parts: partsByMessage.get(messageRow.id) ?? [],
    }))
  }

  export function userMessageCount(sessionID: string) {
    assertSessionRow(sessionID)

    const rows = Database.use((db) =>
      db.select().from(MessageTable).where(eq(MessageTable.session_id, sessionID)).all(),
    )
    let count = 0
    for (const row of rows) {
      if ((row.data as { role?: string }).role === "user") {
        count += 1
      }
    }
    return count
  }

  export function getAssistantInfo(sessionID: string, messageID: string) {
    const message = getMessageWithParts(sessionID, messageID)
    if (!message) return undefined
    if (message.info.role !== "assistant") return undefined
    return message.info as AssistantMessage
  }
}
