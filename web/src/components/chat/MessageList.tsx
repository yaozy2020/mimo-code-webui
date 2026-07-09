import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppState } from "@/stores/appStore"
import { MessageBubble } from "./MessageBubble"

const BOTTOM_STICKY_THRESHOLD_PX = 140

export function MessageList() {
  const { activeSessionID, messages } = useAppState()
  const sessionMessages = activeSessionID ? messages[activeSessionID] || [] : []
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const lastSessionIDRef = useRef<string | null>(null)
  const rafRef = useRef<number>(0)

  const updateStickyState = () => {
    const scroller = scrollRef.current
    if (!scroller) return
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    shouldStickToBottomRef.current = distanceFromBottom <= BOTTOM_STICKY_THRESHOLD_PX
  }

  useEffect(() => {
    const sessionChanged = lastSessionIDRef.current !== activeSessionID
    if (lastSessionIDRef.current !== activeSessionID) {
      lastSessionIDRef.current = activeSessionID
      shouldStickToBottomRef.current = true
    }

    if (!shouldStickToBottomRef.current) return
    const el = bottomRef.current
    if (!el) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: sessionChanged ? "smooth" : "auto", block: "end" })
    })
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [activeSessionID, sessionMessages])

  return (
    <ScrollArea ref={scrollRef} className="flex-1 px-3 sm:px-5" onScroll={updateStickyState}>
      <div className="mx-auto max-w-3xl py-3 space-y-0.5">
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
