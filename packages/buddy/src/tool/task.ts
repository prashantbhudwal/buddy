import z from "zod"
import { Agent } from "../agent/agent.js"
import { PermissionNext } from "../permission/next.js"
import { errorSession, logSession } from "../session/debug.js"
import { SessionPrompt } from "../session/prompt.js"
import { SessionStore } from "../session/session-store.js"
import { Tool } from "./tool.js"
import DESCRIPTION from "./task.txt"

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

class TaskWaitTimeoutError extends Error {
  readonly sessionID: string
  readonly elapsedMs: number

  constructor(sessionID: string, elapsedMs: number) {
    super(`Task execution timed out after ${Math.round(elapsedMs / 1000)}s`)
    this.name = "TaskWaitTimeoutError"
    this.sessionID = sessionID
    this.elapsedMs = elapsedMs
  }
}

async function waitForIdle(
  sessionID: string,
  abort: AbortSignal,
  maxWaitMs = 120_000,
  onProgress?: (input: { elapsedMs: number; busy: boolean }) => void,
) {
  const start = Date.now()
  let lastProgressAt = 0

  while (SessionStore.isBusy(sessionID)) {
    abort.throwIfAborted()

    const elapsedMs = Date.now() - start
    if (elapsedMs - lastProgressAt >= 5_000) {
      lastProgressAt = elapsedMs
      onProgress?.({ elapsedMs, busy: true })
    }

    if (elapsedMs > maxWaitMs) {
      throw new TaskWaitTimeoutError(sessionID, elapsedMs)
    }

    await sleep(150)
  }

  onProgress?.({
    elapsedMs: Date.now() - start,
    busy: false,
  })
}

function summarizeChildProgress(sessionID: string) {
  const history = SessionStore.listMessages(sessionID)
  const toolParts = history.flatMap((message) => message.parts.filter((part) => part.type === "tool"))

  const counts = {
    pending: 0,
    running: 0,
    completed: 0,
    error: 0,
  }

  for (const part of toolParts) {
    if (part.type !== "tool") continue
    if (part.state.status === "pending") counts.pending += 1
    if (part.state.status === "running") counts.running += 1
    if (part.state.status === "completed") counts.completed += 1
    if (part.state.status === "error") counts.error += 1
  }

  return {
    messages: history.length,
    tools: counts,
  }
}

function getAssistantResult(sessionID: string) {
  const history = SessionStore.listMessages(sessionID)
  const lastAssistant = [...history].reverse().find((message) => message.info.role === "assistant")
  if (!lastAssistant) {
    return ""
  }

  const text = lastAssistant.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n\n")
    .trim()

  if (text) return text

  const completedTools = lastAssistant.parts.filter((part) => part.type === "tool" && part.state.status === "completed")
  const erroredTools = lastAssistant.parts.filter((part) => part.type === "tool" && part.state.status === "error")

  const lines = ["Sub-agent completed without text output.", "Tool outcomes:"]
  for (const part of completedTools) {
    if (part.type !== "tool" || part.state.status !== "completed") continue
    lines.push(`- ${part.tool}: completed`)
  }
  for (const part of erroredTools) {
    if (part.type !== "tool" || part.state.status !== "error") continue
    lines.push(`- ${part.tool}: error (${part.state.error})`)
  }
  if (completedTools.length === 0 && erroredTools.length === 0) {
    lines.push("- No tool outputs were recorded.")
  }

  return lines.join("\n")
}

function resolveModel(sessionID: string) {
  const history = SessionStore.listMessages(sessionID)
  const lastUser = [...history].reverse().find((message) => message.info.role === "user")
  const model = lastUser?.info.role === "user" ? lastUser.info.model : undefined
  return model ?? { providerID: "anthropic", modelID: "k2p5" }
}

export const TaskTool = Tool.define("task", async (initCtx) => {
  const agents = await Agent.list().then((list) => list.filter((agent) => agent.mode !== "primary"))

  const caller = initCtx?.agent
  const accessibleAgents = caller
    ? agents.filter((agent) => PermissionNext.evaluate("task", agent.name, caller.permission).action !== "deny")
    : agents

  const description = DESCRIPTION.replace(
    "{agents}",
    accessibleAgents
      .map((agent) => `- ${agent.name}: ${agent.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )

  return {
    description,
    parameters,
    async execute(params, ctx) {
      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.get(params.subagent_type)
      if (!agent || agent.mode === "primary") {
        throw new Error(`Unknown agent type: ${params.subagent_type}`)
      }

      const hasTaskPermission = agent.permission.some(
        (rule) => rule.permission === "task" && rule.action !== "deny",
      )

      const taskSession = params.task_id ? SessionStore.get(params.task_id) : undefined
      const session =
        taskSession ??
        SessionStore.create({
          parentID: ctx.sessionID,
          title: `${params.description} (@${agent.name} subagent)`,
          permission: [
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "todoread",
              pattern: "*",
              action: "deny",
            },
            ...(hasTaskPermission
              ? []
              : [
                  {
                    permission: "task",
                    pattern: "*",
                    action: "deny",
                  } as const,
                ]),
          ],
        })

      logSession("task.child_session", {
        parentSessionID: ctx.sessionID,
        childSessionID: session.id,
        reused: Boolean(taskSession),
        subagent: agent.name,
      })

      const model = resolveModel(ctx.sessionID)

      await ctx.metadata({
        title: params.description,
        metadata: {
          phase: "starting",
          sessionId: session.id,
          agent: agent.name,
          model,
          reused: Boolean(taskSession),
          progress: summarizeChildProgress(session.id),
        },
      })

      const abortChild = () => {
        logSession("task.abort.signal", {
          parentSessionID: ctx.sessionID,
          childSessionID: session.id,
        })
        void SessionPrompt.abort(session.id).catch((error) => {
          errorSession("task.abort.child_failed", error, {
            parentSessionID: ctx.sessionID,
            childSessionID: session.id,
          })
        })
      }

      ctx.abort.addEventListener("abort", abortChild)
      try {
        await SessionPrompt.prompt({
          sessionID: session.id,
          content: params.prompt,
          agent: agent.name,
          model,
          tools: {
            todowrite: false,
            todoread: false,
            ...(hasTaskPermission ? {} : { task: false }),
          },
        })

        await waitForIdle(session.id, ctx.abort, 120_000, ({ elapsedMs, busy }) => {
          const progress = summarizeChildProgress(session.id)
          void ctx.metadata({
            title: params.description,
            metadata: {
              phase: busy ? "running" : "completed",
              elapsedMs,
              sessionId: session.id,
              agent: agent.name,
              model,
              progress,
            },
          })
        })
      } catch (error) {
        if (error instanceof TaskWaitTimeoutError) {
          logSession("task.timeout", {
            parentSessionID: ctx.sessionID,
            childSessionID: error.sessionID,
            elapsedMs: error.elapsedMs,
          })

          try {
            const didAbort = await SessionPrompt.abort(session.id)
            logSession("task.timeout.abort_child", {
              parentSessionID: ctx.sessionID,
              childSessionID: session.id,
              didAbort,
            })
          } catch (abortError) {
            errorSession("task.timeout.abort_child_failed", abortError, {
              parentSessionID: ctx.sessionID,
              childSessionID: session.id,
            })
          }
        }

        errorSession("task.failed", error, {
          parentSessionID: ctx.sessionID,
          childSessionID: session.id,
          subagent: agent.name,
        })
        throw error
      } finally {
        ctx.abort.removeEventListener("abort", abortChild)
      }

      const output = [
        `task_id: ${session.id} (for resuming to continue this task if needed)`,
        "",
        "<task_result>",
        getAssistantResult(session.id),
        "</task_result>",
      ].join("\n")

      return {
        title: params.description,
        metadata: {
          sessionId: session.id,
          agent: agent.name,
          model,
          reused: Boolean(taskSession),
          truncated: false,
        },
        output,
      }
    },
  }
})
