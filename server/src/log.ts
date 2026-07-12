type LogLevel = "info" | "warn" | "error"

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })
  if (level === "error") console.error(entry)
  else if (level === "warn") console.warn(entry)
  else console.log(entry)
}
