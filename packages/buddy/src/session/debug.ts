type LogContext = Record<string, unknown>

function format(prefix: string, event: string, context?: LogContext) {
  const base = `[${prefix}] ${event}`
  if (!context || Object.keys(context).length === 0) {
    return base
  }
  return `${base} ${JSON.stringify(context)}`
}

export function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function logSession(event: string, context?: LogContext) {
  console.info(format("session", event, context))
}

export function warnSession(event: string, context?: LogContext) {
  console.warn(format("session", event, context))
}

export function errorSession(event: string, error: unknown, context?: LogContext) {
  console.error(
    format("session", event, {
      ...context,
      error: stringifyError(error),
    }),
  )
}
