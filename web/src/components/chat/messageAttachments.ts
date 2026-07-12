import type { Message, MessagePart } from "../../types"

export function getVisibleAttachments(message: Pick<Message, "parts">): MessagePart[] {
  const seen = new Set<string>()
  return message.parts?.filter((part) => {
    if (part.type !== "file" && part.type !== "image") return false
    const source = part.url || part.content || part.text
    const identity = source
      ? source
      : `${part.type}:${part.mime ?? ""}:${part.filename ?? ""}:${part.id}`
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  }) ?? []
}

export function attachmentPreviewClassName(role: Message["role"]) {
  if (role === "user") {
    return "block overflow-hidden rounded-xl border border-primary/15 bg-primary/5"
  }
  return "block overflow-hidden rounded-xl border border-border/70 bg-muted/30"
}

export function attachmentFileClassName(role: Message["role"]) {
  if (role === "user") {
    return "flex max-w-full items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-foreground"
  }
  return "flex max-w-full items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-foreground"
}
