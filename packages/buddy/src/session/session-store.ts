import type { AssistantMessage, MessageInfo, MessagePart } from "./message-v2/index.js"
import { Instance } from "../project/instance.js"
import { SessionStorage } from "./session-storage.js"

const activeAbortsByProject = new Map<string, Map<string, AbortController>>()

function activeAborts() {
  const projectID = Instance.project.id
  const existing = activeAbortsByProject.get(projectID)
  if (existing) return existing

  const created = new Map<string, AbortController>()
  activeAbortsByProject.set(projectID, created)
  return created
}

function clearProjectAbortMapWhenEmpty(projectID: string, map: Map<string, AbortController>) {
  if (map.size > 0) return
  const current = activeAbortsByProject.get(projectID)
  if (current === map) {
    activeAbortsByProject.delete(projectID)
  }
}

export namespace SessionStore {
  export function list(input?: { limit?: number; directory?: string }) {
    return SessionStorage.list(input)
  }

  export function create() {
    return SessionStorage.create()
  }

  export function get(sessionID: string) {
    return SessionStorage.get(sessionID)
  }

  export function assert(sessionID: string) {
    SessionStorage.assert(sessionID)
  }

  export function setTitle(sessionID: string, title: string) {
    return SessionStorage.setTitle(sessionID, title)
  }

  export function touch(sessionID: string) {
    return SessionStorage.touch(sessionID)
  }

  export function appendMessage(info: MessageInfo) {
    return SessionStorage.appendMessage(info)
  }

  export function updateMessage(info: MessageInfo) {
    return SessionStorage.updateMessage(info)
  }

  export function appendPart(part: MessagePart) {
    return SessionStorage.appendPart(part)
  }

  export function updatePart(part: MessagePart) {
    return SessionStorage.updatePart(part)
  }

  export function updatePartDelta(input: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }) {
    return SessionStorage.updatePartDelta(input)
  }

  export function getMessageWithParts(sessionID: string, messageID: string) {
    return SessionStorage.getMessageWithParts(sessionID, messageID)
  }

  export function listMessages(sessionID: string) {
    return SessionStorage.listMessages(sessionID)
  }

  export function userMessageCount(sessionID: string) {
    return SessionStorage.userMessageCount(sessionID)
  }

  export function setActiveAbort(sessionID: string, controller: AbortController) {
    assert(sessionID)
    activeAborts().set(sessionID, controller)
    touch(sessionID)
  }

  export function clearActiveAbort(sessionID: string) {
    assert(sessionID)
    const projectID = Instance.project.id
    const map = activeAborts()
    map.delete(sessionID)
    clearProjectAbortMapWhenEmpty(projectID, map)
    touch(sessionID)
  }

  export function isBusy(sessionID: string) {
    assert(sessionID)
    return activeAborts().has(sessionID)
  }

  export function abort(sessionID: string) {
    assert(sessionID)
    const controller = activeAborts().get(sessionID)
    if (!controller) {
      return false
    }
    controller.abort("User aborted")
    return true
  }

  export function getAssistantInfo(sessionID: string, messageID: string) {
    return SessionStorage.getAssistantInfo(sessionID, messageID) as AssistantMessage | undefined
  }
}
