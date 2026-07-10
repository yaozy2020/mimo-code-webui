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
