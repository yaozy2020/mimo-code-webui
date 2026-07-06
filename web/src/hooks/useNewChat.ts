import { useCallback } from "react"
import { createSession } from "@/api/session"
import { useAppDispatch } from "@/stores/appStore"

export function useNewChat() {
  const dispatch = useAppDispatch()

  return useCallback(async (input: { directory?: string; title?: string } = {}) => {
    try {
      const session = await createSession(input)
      const routedSession = input.directory && !session.directory ? { ...session, directory: input.directory } : session
      dispatch({ type: "ADD_SESSION", session: routedSession })
      dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: routedSession.directory ?? input.directory ?? null })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: routedSession.id })
      dispatch({ type: "SET_MESSAGES", sessionID: routedSession.id, messages: [] })
      return routedSession
    } catch (error) {
      console.error("[useNewChat] failed to create new chat:", error)
      throw error
    }
  }, [dispatch])
}
