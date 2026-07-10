import type { MessagePart } from "../../types"

function firstString(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function toolTaskTitle(part: MessagePart) {
  const input = part.state?.input
  if (!input || typeof input !== "object") return ""
  return firstString(input as Record<string, unknown>, ["summary", "content", "title", "task", "todo", "description", "prompt"])
}

export function isToolDone(status: unknown) {
  return ["completed", "success", "done"].includes(String(status ?? ""))
}

export function isToolRunning(status: unknown) {
  return ["pending", "running", "in_progress", "busy"].includes(String(status ?? ""))
}
