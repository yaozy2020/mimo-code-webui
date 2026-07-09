import type { Message, MessagePart } from "../../types"

export function getVisibleAttachments(message: Pick<Message, "parts">): MessagePart[] {
  return message.parts?.filter((part) => part.type === "file" || part.type === "image") ?? []
}
