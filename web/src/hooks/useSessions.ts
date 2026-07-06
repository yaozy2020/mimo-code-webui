import { useCallback, useEffect } from "react"
import { createSession, deleteSession, forkSession, getTodos, listSessions, updateSession } from "@/api/session"
import { useAppDispatch, useAppState } from "@/stores/appStore"

export function useSessions() {
  const dispatch = useAppDispatch()
  const { sessions, activeSessionID } = useAppState()

  const load = useCallback(async () => {
    try {
      const data = await listSessions()
      dispatch({ type: "SET_SESSIONS", sessions: data })
      const todoResults = await Promise.allSettled(data.map((session) => getTodos(session.id)))
      todoResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          dispatch({ type: "SET_TODOS", sessionID: data[index].id, todos: result.value })
        }
      })
    } catch (error) {
      console.error("[useSessions] failed to load sessions:", error)
    }
  }, [dispatch])

  const create = useCallback(
    async (directory?: string) => {
      const session = await createSession(directory)
      dispatch({ type: "ADD_SESSION", session })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
      return session
    },
    [dispatch],
  )

  const remove = useCallback(
    async (sessionID: string) => {
      await deleteSession(sessionID)
      dispatch({ type: "DELETE_SESSION", sessionID })
    },
    [dispatch],
  )

  const rename = useCallback(
    async (sessionID: string, title: string) => {
      const session = await updateSession(sessionID, { title })
      dispatch({ type: "UPDATE_SESSION", session })
    },
    [dispatch],
  )

  const fork = useCallback(
    async (sessionID: string, messageID: string) => {
      const session = await forkSession(sessionID, messageID)
      dispatch({ type: "ADD_SESSION", session })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
      return session
    },
    [dispatch],
  )

  const setActive = useCallback(
    (sessionID: string | null) => {
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID })
    },
    [dispatch],
  )

  useEffect(() => {
    load()
  }, [load])

  return {
    sessions,
    activeSessionID,
    load,
    create,
    remove,
    rename,
    fork,
    setActive,
  }
}
