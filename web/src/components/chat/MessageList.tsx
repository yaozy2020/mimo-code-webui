import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppState } from "@/stores/appStore"
import { MessageBubble } from "./MessageBubble"

export function MessageList() {
  const { activeSessionID, messages } = useAppState()
  const sessionMessages = activeSessionID ? messages[activeSessionID] || [] : []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [sessionMessages])

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="mx-auto max-w-3xl py-6">
        {sessionMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onCopy={() => navigator.clipboard.writeText(message.content || "")}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
