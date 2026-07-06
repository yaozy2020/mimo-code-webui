import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppState } from "@/stores/appStore"
import { MessageBubble } from "./MessageBubble"

const BOTTOM_STICKY_THRESHOLD_PX = 96

export function MessageList() {
  const { activeSessionID, messages } = useAppState()
  const sessionMessages = activeSessionID ? messages[activeSessionID] || [] : []
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const lastSessionIDRef = useRef<string | null>(null)

  const updateStickyState = () => {
    const scroller = scrollRef.current
    if (!scroller) return
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    shouldStickToBottomRef.current = distanceFromBottom <= BOTTOM_STICKY_THRESHOLD_PX
  }

  useEffect(() => {
    if (lastSessionIDRef.current !== activeSessionID) {
      lastSessionIDRef.current = activeSessionID
      shouldStickToBottomRef.current = true
    }

    if (!shouldStickToBottomRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeSessionID, sessionMessages])

  return (
    <ScrollArea ref={scrollRef} className="flex-1 px-2 sm:px-4" onScroll={updateStickyState}>
      <div className="mx-auto max-w-3xl py-4 sm:py-6">
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
