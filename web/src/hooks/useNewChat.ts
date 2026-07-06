import { useCallback } from "react"
import { createSession } from "@/api/session"
import { useAppDispatch } from "@/stores/appStore"

export function useNewChat() {
  const dispatch = useAppDispatch()

  return useCallback(async (input: { directory?: string; title?: string } = {}) => {
    try {
      const session = await createSession(input)
      dispatch({ type: "ADD_SESSION", session })
      dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: session.directory ?? input.directory ?? null })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
      dispatch({ type: "SET_MESSAGES", sessionID: session.id, messages: [] })
      return session
    } catch (error) {
      console.error("[useNewChat] failed to create new chat:", error)
      throw error
    }
  }, [dispatch])
}
