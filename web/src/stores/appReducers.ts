import type { Message } from "@/types"

type MessagesBySession = Record<string, Message[]>

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
