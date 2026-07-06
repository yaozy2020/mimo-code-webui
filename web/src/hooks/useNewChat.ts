import { useCallback } from "react"
import { createSession } from "@/api/session"
import { useAppDispatch } from "@/stores/appStore"

export function useNewChat() {
  const dispatch = useAppDispatch()

  return useCallback(async () => {
    try {
      const session = await createSession()
      dispatch({ type: "ADD_SESSION", session })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
      dispatch({ type: "SET_MESSAGES", sessionID: session.id, messages: [] })
      return session
    } catch (error) {
      console.error("[useNewChat] failed to create new chat:", error)
      throw error
    }
  }, [dispatch])
}
