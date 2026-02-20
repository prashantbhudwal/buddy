import { ulid } from "ulid"

function next(prefix: string) {
  return `${prefix}_${ulid().toLowerCase()}`
}

export function newSessionID() {
  return next("session")
}

export function newMessageID() {
  return next("message")
}

export function newPartID() {
  return next("part")
}

