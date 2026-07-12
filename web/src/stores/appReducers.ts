import type { Message } from "@/types"

type MessagesBySession = Record<string, Message[]>

export function findMessageReconciliationIndex(messages: Message[], incoming: Message) {
  return messages.findIndex((message) => message.id === incoming.id)
}

function isVisibleAttachment(part: NonNullable<Message["parts"]>[number]) {
  return part.type === "file" || part.type === "image"
}

function attachmentIdentity(part: NonNullable<Message["parts"]>[number]) {
  const source = part.url || part.content || part.text
  if (source) return source
  return `${part.type}:${part.mime ?? ""}:${part.filename ?? ""}:${part.id}`
}

export function mergeMessagePartsWithVisibleAttachments(
  preferredParts: Message["parts"],
  fallbackParts: Message["parts"],
): Message["parts"] {
  const localAttachments = fallbackParts?.filter(isVisibleAttachment) ?? []
  if (!preferredParts?.length || localAttachments.length === 0) return preferredParts ?? fallbackParts
  const existingAttachments = new Set(preferredParts.filter(isVisibleAttachment).map(attachmentIdentity))
  const missingAttachments = localAttachments.filter((part) => !existingAttachments.has(attachmentIdentity(part)))
  return missingAttachments.length > 0 ? [...preferredParts, ...missingAttachments] : preferredParts
}

export function appendMessageContent(messages: MessagesBySession, sessionID: string, messageID: string, content: string): MessagesBySession {
  const msgs = messages[sessionID] || []
  const exists = msgs.some((message) => message.id === messageID)
  const fallbackMessage: Message = {
    id: messageID,
    sessionID,
    role: "assistant",
    content,
    time: { created: Date.now() },
  }
  const nextMessages = exists
    ? msgs.map((message) => (message.id === messageID ? { ...message, content: (message.content || "") + content } : message))
    : [...msgs, fallbackMessage]
  return { ...messages, [sessionID]: nextMessages }
}

export function setMessageContent(messages: MessagesBySession, sessionID: string, messageID: string, content: string): MessagesBySession {
  const msgs = messages[sessionID] || []
  const exists = msgs.some((message) => message.id === messageID)
  const fallbackMessage: Message = {
    id: messageID,
    sessionID,
    role: "assistant",
    content,
    time: { created: Date.now() },
  }
  const nextMessages = exists
    ? msgs.map((message) => {
        if (message.id !== messageID) return message
        const currentContent = message.content ?? ""
        const keepCurrent = message.role === "assistant" && currentContent.length > content.length
        return keepCurrent ? message : { ...message, content }
      })
    : [...msgs, fallbackMessage]
  return { ...messages, [sessionID]: nextMessages }
}
