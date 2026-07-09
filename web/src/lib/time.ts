export function formatActivityTime(timestamp?: number) {
  if (!timestamp) return "暂无活动"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

export function formatMessageTime(timestamp?: number) {
  if (!timestamp) return ""
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}
