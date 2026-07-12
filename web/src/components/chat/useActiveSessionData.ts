import { useEffect } from "react"
import { getMessages, getRecentMessages, getSessionDiff, getTodos } from "@/api/session"
import { useAppDispatch } from "@/stores/appStore"
import type { Message } from "@/types"

const MESSAGE_REFRESH_INTERVAL_MS = 3000

function latestUserMessageID(messages: Message[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.id
}

export function useActiveSessionData(input: { activeSessionID: string | null; activeDirectory?: string }) {
  const dispatch = useAppDispatch()
  const { activeSessionID, activeDirectory } = input

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false

    const load = async () => {
      try {
        const msgs = await getRecentMessages(activeSessionID, activeDirectory)
        if (cancelled) return
        dispatch({ type: "SET_MESSAGES", sessionID: activeSessionID, messages: msgs })
        const messageID = latestUserMessageID(msgs)
        if (messageID) {
          const diff = await getSessionDiff(activeSessionID, messageID, activeDirectory)
          if (!cancelled) dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff })
        } else if (!cancelled) {
          dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff: [] })
        }
      } catch (error) {
        console.error("[ChatArea] failed to load messages:", error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeDirectory, activeSessionID, dispatch])

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false

    const load = async () => {
      try {
        const todos = await getTodos(activeSessionID, activeDirectory)
        if (cancelled) return
        dispatch({ type: "SET_TODOS", sessionID: activeSessionID, todos })
      } catch (error) {
        console.error("[ChatArea] failed to load todos:", error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeDirectory, activeSessionID, dispatch])

  useEffect(() => {
    if (!activeSessionID) return
    let cancelled = false
    const refresh = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const todos = await getTodos(activeSessionID, activeDirectory)
        if (!cancelled) {
          dispatch({ type: "SET_TODOS", sessionID: activeSessionID, todos })
        }
        const msgs = await getMessages(activeSessionID, 50, undefined, activeDirectory)
        if (!cancelled) {
          dispatch({ type: "SET_MESSAGES", sessionID: activeSessionID, messages: msgs })
          const messageID = latestUserMessageID(msgs)
          if (messageID) {
            const diff = await getSessionDiff(activeSessionID, messageID, activeDirectory)
            if (!cancelled) dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff })
          } else {
            dispatch({ type: "SET_SESSION_DIFF", sessionID: activeSessionID, diff: [] })
          }
        }
      } catch (error) {
        console.error("[ChatArea] failed to refresh:", error)
      }
    }

    const interval = window.setInterval(refresh, MESSAGE_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeDirectory, activeSessionID, dispatch])
}
