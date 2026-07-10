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
