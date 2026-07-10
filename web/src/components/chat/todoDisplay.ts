import type { TodoItem } from "../../types"

type LooseTodoItem = TodoItem & {
  title?: unknown
  text?: unknown
  description?: unknown
}

export function todoDisplayText(todo: LooseTodoItem) {
  const value = todo.content || todo.title || todo.text || todo.description
  return typeof value === "string" && value.trim() ? value.trim() : "未命名任务"
}

export function isTodoDone(todo: Pick<LooseTodoItem, "completed" | "status">) {
  return Boolean(todo.completed) || ["completed", "success", "done"].includes(String(todo.status ?? ""))
}

export function isTodoRunning(todo: Pick<LooseTodoItem, "status">) {
  return ["in_progress", "running", "busy"].includes(String(todo.status ?? ""))
}
