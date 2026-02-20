import { generateText } from "ai"
import z from "zod"
import { Bus } from "../bus/index.js"
import { kimiModel } from "./kimi.js"
import { newMessageID, newPartID } from "./id.js"
import { MessageEvents, type AssistantMessage, type MessageWithParts, type UserMessage } from "./message-v2/index.js"
import { processAssistantResponse } from "./processor.js"
import { SessionStore } from "./session-store.js"
import { SessionInfo } from "./session-info.js"
import { errorSession, logSession } from "./debug.js"

const TITLE_PROMPT = [
  "Generate a concise title for this conversation.",
  "Rules:",
  "- 4 to 8 words.",
  "- No quotes.",
  "- Prefer action-oriented wording.",
].join("\n")

function emptyTokens() {
  return {
    total: undefined as number | undefined,
    input: 0,
    output: 0,
    reasoning: 0,
    cache: {
      read: 0,
      write: 0,
    },
  }
}

export namespace SessionPrompt {
  export const PromptInput = z.object({
    sessionID: z.string(),
    content: z.string().min(1),
  })

  async function publishMessage(message: MessageWithParts) {
    await Bus.publish(MessageEvents.Updated, { info: message.info })
    for (const part of message.parts) {
      await Bus.publish(MessageEvents.PartUpdated, { part })
    }
  }

  async function generateSessionTitle(sessionID: string) {
    logSession("title.start", { sessionID })
    const history = SessionStore.listMessages(sessionID)
    const firstUser = history.find((message) => message.info.role === "user")
    const firstText = firstUser?.parts.find((part) => part.type === "text")
    if (!firstText || firstText.type !== "text") return

    const result = await generateText({
      model: kimiModel(),
      system: TITLE_PROMPT,
      prompt: firstText.text,
      maxOutputTokens: 24,
      temperature: 0.6,
      topP: 0.95,
    })

    const title = result.text.replace(/^["'\s]+|["'\s]+$/g, "").trim()
    if (!title) return

    const info = SessionStore.setTitle(sessionID, title)
    await Bus.publish(SessionInfo.Event.Updated, { info })
    logSession("title.updated", {
      sessionID,
      title,
    })
  }

  export async function prompt(input: z.input<typeof PromptInput>) {
    const parsed = PromptInput.parse(input)
    logSession("prompt.received", {
      sessionID: parsed.sessionID,
      contentLength: parsed.content.length,
    })
    SessionStore.assert(parsed.sessionID)
    if (SessionStore.isBusy(parsed.sessionID)) {
      logSession("prompt.rejected.busy", { sessionID: parsed.sessionID })
      throw new Error("Session is already running")
    }

    const now = Date.now()

    const userInfo: UserMessage = {
      id: newMessageID(),
      sessionID: parsed.sessionID,
      role: "user",
      agent: "buddy",
      model: {
        providerID: "anthropic",
        modelID: "k2p5",
      },
      time: {
        created: now,
      },
    }

    const userMessage = SessionStore.appendMessage(userInfo)
    if (!userMessage) {
      throw new Error("Failed to append user message")
    }

    const userPart = {
      id: newPartID(),
      sessionID: parsed.sessionID,
      messageID: userInfo.id,
      type: "text" as const,
      text: parsed.content,
      time: {
        start: now,
      },
    }
    SessionStore.appendPart(userPart)
    logSession("prompt.user.created", {
      sessionID: parsed.sessionID,
      messageID: userInfo.id,
      partID: userPart.id,
    })
    await publishMessage({
      info: userInfo,
      parts: [userPart],
    })

    const assistantInfo: AssistantMessage = {
      id: newMessageID(),
      sessionID: parsed.sessionID,
      role: "assistant",
      agent: "buddy",
      time: {
        created: Date.now(),
      },
      cost: 0,
      tokens: emptyTokens(),
    }

    const assistantMessage = SessionStore.appendMessage(assistantInfo)
    if (!assistantMessage) {
      throw new Error("Failed to append assistant message")
    }
    logSession("prompt.assistant.created", {
      sessionID: parsed.sessionID,
      messageID: assistantInfo.id,
    })
    await publishMessage(assistantMessage)

    const abortController = new AbortController()
    SessionStore.setActiveAbort(parsed.sessionID, abortController)
    await Bus.publish(SessionInfo.Event.Status, {
      sessionID: parsed.sessionID,
      status: "busy",
    })
    logSession("prompt.status.busy", {
      sessionID: parsed.sessionID,
      assistantMessageID: assistantInfo.id,
    })

    void processAssistantResponse({
      sessionID: parsed.sessionID,
      assistantMessageID: assistantInfo.id,
      abortSignal: abortController.signal,
    }).catch(async (error) => {
      errorSession("prompt.processor.unhandled", error, {
        sessionID: parsed.sessionID,
        assistantMessageID: assistantInfo.id,
      })
      const failed = SessionStore.getAssistantInfo(parsed.sessionID, assistantInfo.id)
      if (!failed) return
      const next: AssistantMessage = {
        ...failed,
        error: String(error),
      }
      SessionStore.updateMessage(next)
      await Bus.publish(MessageEvents.Updated, { info: next })
      SessionStore.clearActiveAbort(parsed.sessionID)
      await Bus.publish(SessionInfo.Event.Status, {
        sessionID: parsed.sessionID,
        status: "idle",
      })
    })

    if (SessionStore.userMessageCount(parsed.sessionID) === 1) {
      void generateSessionTitle(parsed.sessionID).catch((error) => {
        errorSession("title.failed", error, { sessionID: parsed.sessionID })
      })
    }

    return assistantMessage
  }

  export async function abort(sessionID: string) {
    SessionStore.assert(sessionID)
    logSession("abort.requested", { sessionID })
    const didAbort = SessionStore.abort(sessionID)
    logSession("abort.completed", { sessionID, didAbort })
    return didAbort
  }
}
