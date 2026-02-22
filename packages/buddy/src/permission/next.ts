import os from "node:os"
import { ulid } from "ulid"
import z from "zod"
import { BusEvent } from "../bus/bus-event.js"
import { Bus } from "../bus/index.js"
import { Config } from "../config/config.js"
import { Instance } from "../project/instance.js"
import { PermissionTable } from "../session/session.sql.js"
import { Database, eq } from "../storage/db.js"

type PendingRequest = {
  info: Request
  resolve: () => void
  reject: (error: Error) => void
}

type ProjectState = {
  approved: Ruleset
  pending: Map<string, PendingRequest>
}

const stateByProject = new Map<string, ProjectState>()

function wildcardMatch(value: string, pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "s").test(value)
}

function expand(pattern: string) {
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("~/")) return pathJoinHome(pattern.slice(2))
  if (pattern.startsWith("$HOME/")) return pathJoinHome(pattern.slice(6))
  if (pattern === "$HOME") return os.homedir()
  return pattern
}

function pathJoinHome(suffix: string) {
  return `${os.homedir()}/${suffix}`
}

function newPermissionID() {
  return `permission_${ulid().toLowerCase()}`
}

export namespace PermissionNext {
  export const Action = z.enum(["allow", "deny", "ask"])
  export type Action = z.infer<typeof Action>

  export const Rule = z.object({
    permission: z.string(),
    pattern: z.string(),
    action: Action,
  })
  export type Rule = z.infer<typeof Rule>

  export const Ruleset = z.array(Rule)
  export type Ruleset = z.infer<typeof Ruleset>

  export const Request = z.object({
    id: z.string(),
    sessionID: z.string(),
    permission: z.string(),
    patterns: z.array(z.string()),
    metadata: z.record(z.string(), z.any()),
    always: z.array(z.string()),
    tool: z
      .object({
        messageID: z.string(),
        callID: z.string(),
      })
      .optional(),
  })
  export type Request = z.infer<typeof Request>

  export const Reply = z.enum(["once", "always", "reject"])
  export type Reply = z.infer<typeof Reply>

  export const Event = {
    Asked: BusEvent.define("permission.asked", Request),
    Replied: BusEvent.define(
      "permission.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        reply: Reply,
      }),
    ),
  }

  const AskInput = Request.partial({ id: true }).extend({
    ruleset: Ruleset,
  })

  const ReplyInput = z.object({
    requestID: z.string(),
    reply: Reply,
    message: z.string().optional(),
  })

  function mergeInternal(...rulesets: Ruleset[]) {
    return rulesets.flat()
  }

  function loadProjectState(projectID: string): ProjectState {
    const cached = stateByProject.get(projectID)
    if (cached) {
      return cached
    }

    const row = Database.use((db) =>
      db.select().from(PermissionTable).where(eq(PermissionTable.project_id, projectID)).get(),
    )

    const approved = row ? Ruleset.safeParse(row.data).data ?? [] : []
    const created: ProjectState = {
      approved,
      pending: new Map(),
    }
    stateByProject.set(projectID, created)
    return created
  }

  function persistApproved(projectID: string, approved: Ruleset) {
    const now = Date.now()
    const existing = Database.use((db) =>
      db.select().from(PermissionTable).where(eq(PermissionTable.project_id, projectID)).get(),
    )

    if (existing) {
      Database.use((db) => {
        db.update(PermissionTable)
          .set({
            data: approved,
            time_updated: now,
          })
          .where(eq(PermissionTable.project_id, projectID))
          .run()
      })
      return
    }

    Database.use((db) => {
      db.insert(PermissionTable)
        .values({
          project_id: projectID,
          data: approved,
          time_created: now,
          time_updated: now,
        })
        .run()
    })
  }

  export function fromConfig(permission: Config.Permission | undefined) {
    if (!permission) return []

    const ruleset: Ruleset = []
    for (const [permissionKey, value] of Object.entries(permission)) {
      if (typeof value === "string") {
        ruleset.push({
          permission: permissionKey,
          pattern: "*",
          action: value,
        })
        continue
      }

      for (const [pattern, action] of Object.entries(value)) {
        ruleset.push({
          permission: permissionKey,
          pattern: expand(pattern),
          action,
        })
      }
    }

    return ruleset
  }

  export function merge(...rulesets: Ruleset[]) {
    return mergeInternal(...rulesets)
  }

  export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]) {
    const merged = mergeInternal(...rulesets)
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const rule = merged[i]
      if (!wildcardMatch(permission, rule.permission)) {
        continue
      }
      if (!wildcardMatch(pattern, rule.pattern)) {
        continue
      }
      return rule
    }

    return {
      permission,
      pattern: "*",
      action: "ask" as const,
    }
  }

  const EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit"])

  export function disabled(tools: string[], ruleset: Ruleset) {
    const disabledTools = new Set<string>()

    for (const toolID of tools) {
      const permission = EDIT_TOOLS.has(toolID) ? "edit" : toolID
      let match: Rule | undefined
      for (let i = ruleset.length - 1; i >= 0; i -= 1) {
        const candidate = ruleset[i]
        if (wildcardMatch(permission, candidate.permission)) {
          match = candidate
          break
        }
      }
      if (!match) continue
      if (match.pattern === "*" && match.action === "deny") {
        disabledTools.add(toolID)
      }
    }

    return disabledTools
  }

  export async function ask(input: z.input<typeof AskInput>) {
    const parsed = AskInput.parse(input)
    const projectID = Instance.project.id
    const state = loadProjectState(projectID)

    for (const pattern of parsed.patterns) {
      const rule = evaluate(parsed.permission, pattern, parsed.ruleset, state.approved)
      if (rule.action === "deny") {
        throw new DeniedError(parsed.permission)
      }

      if (rule.action === "ask") {
        const requestID = parsed.id ?? newPermissionID()
        const request: Request = {
          ...parsed,
          id: requestID,
        }
        delete (request as { ruleset?: Ruleset }).ruleset

        return new Promise<void>((resolve, reject) => {
          state.pending.set(requestID, {
            info: request,
            resolve,
            reject,
          })
          void Bus.publish(Event.Asked, request)
        })
      }
    }
  }

  export async function reply(input: z.input<typeof ReplyInput>) {
    const parsed = ReplyInput.parse(input)
    const projectID = Instance.project.id
    const state = loadProjectState(projectID)

    const match = state.pending.get(parsed.requestID)
    if (!match) return false

    state.pending.delete(parsed.requestID)
    await Bus.publish(Event.Replied, {
      sessionID: match.info.sessionID,
      requestID: match.info.id,
      reply: parsed.reply,
    })

    if (parsed.reply === "reject") {
      const error = parsed.message ? new CorrectedError(parsed.message) : new RejectedError()
      match.reject(error)

      for (const [pendingID, pending] of state.pending.entries()) {
        if (pending.info.sessionID !== match.info.sessionID) continue
        state.pending.delete(pendingID)
        await Bus.publish(Event.Replied, {
          sessionID: pending.info.sessionID,
          requestID: pending.info.id,
          reply: "reject",
        })
        pending.reject(new RejectedError())
      }
      return true
    }

    if (parsed.reply === "once") {
      match.resolve()
      return true
    }

    for (const pattern of match.info.always) {
      state.approved.push({
        permission: match.info.permission,
        pattern,
        action: "allow",
      })
    }
    persistApproved(projectID, state.approved)
    match.resolve()

    for (const [pendingID, pending] of state.pending.entries()) {
      if (pending.info.sessionID !== match.info.sessionID) continue
      const accepted = pending.info.patterns.every(
        (pattern: string) => evaluate(pending.info.permission, pattern, state.approved).action === "allow",
      )
      if (!accepted) continue
      state.pending.delete(pendingID)
      await Bus.publish(Event.Replied, {
        sessionID: pending.info.sessionID,
        requestID: pending.info.id,
        reply: "always",
      })
      pending.resolve()
    }

    return true
  }

  export async function list() {
    const projectID = Instance.project.id
    const state = loadProjectState(projectID)
    return Array.from(state.pending.values()).map((entry) => entry.info)
  }

  export class RejectedError extends Error {
    constructor() {
      super("The user rejected permission to use this specific tool call.")
    }
  }

  export class CorrectedError extends Error {
    constructor(message: string) {
      super(`The user rejected permission with this feedback: ${message}`)
    }
  }

  export class DeniedError extends Error {
    constructor(permission: string) {
      super(`A permission rule denied access for ${permission}.`)
    }
  }
}

type Ruleset = PermissionNext.Ruleset
type Request = PermissionNext.Request
