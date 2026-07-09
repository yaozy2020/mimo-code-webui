import type { Message } from "@/types"

export function orderMessages(messages: Message[]) {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const aTime = a.message.time?.created
      const bTime = b.message.time?.created
      if (aTime && bTime && aTime !== bTime) return aTime - bTime
      if (aTime && !bTime) return -1
      if (!aTime && bTime) return 1
      return a.index - b.index
    })
    .map((item) => item.message)
}
