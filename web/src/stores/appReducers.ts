import type { Message } from "@/types"

type MessagesBySession = Record<string, Message[]>

function isVisibleAttachment(part: NonNullable<Message["parts"]>[number]) {
  return part.type === "file" || part.type === "image"
}

export function mergeMessagePartsWithVisibleAttachments(
  preferredParts: Message["parts"],
  fallbackParts: Message["parts"],
): Message["parts"] {
  const localAttachments = fallbackParts?.filter(isVisibleAttachment) ?? []
  if (!preferredParts?.length || localAttachments.length === 0) return preferredParts ?? fallbackParts
  const existingIds = new Set(preferredParts.map((part) => part.id))
  const missingAttachments = localAttachments.filter((part) => !existingIds.has(part.id))
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
