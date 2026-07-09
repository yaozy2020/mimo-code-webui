import { useCallback, useEffect } from "react"
import { createSession, deleteSession, forkSession, getTodos, listSessions, updateSession } from "@/api/session"
import { useAppDispatch, useAppState } from "@/stores/appStore"

export function useSessions() {
  const dispatch = useAppDispatch()
  const { sessions, activeSessionID, ownedSessionIDs, attachedSessionIDs } = useAppState()
  const visibleSessionIDs = new Set([...ownedSessionIDs, ...attachedSessionIDs])
  const visibleSessions = sessions.filter((session) => visibleSessionIDs.has(session.id))

  const load = useCallback(async () => {
    try {
      const data = await listSessions()
      dispatch({ type: "SET_SESSIONS", sessions: data })
      const visible = data.filter((session) => visibleSessionIDs.has(session.id))
      const todoResults = await Promise.allSettled(visible.map((session) => getTodos(session.id, session.directory)))
      todoResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          dispatch({ type: "SET_TODOS", sessionID: visible[index].id, todos: result.value })
        }
      })
    } catch (error) {
      console.error("[useSessions] failed to load sessions:", error)
    }
  }, [attachedSessionIDs, dispatch, ownedSessionIDs])

  const create = useCallback(
    async (directory?: string) => {
      const session = await createSession({ directory })
      const routedSession = directory && !session.directory ? { ...session, directory } : session
      dispatch({ type: "ADD_SESSION", session: routedSession })
      dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: routedSession.directory ?? directory ?? null })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: routedSession.id })
      return routedSession
    },
    [dispatch],
  )

  const remove = useCallback(
    async (sessionID: string, options: { deleteRemote?: boolean } = {}) => {
      const directory = sessions.find((session) => session.id === sessionID)?.directory
      if (options.deleteRemote !== false) {
        await deleteSession(sessionID, directory)
        dispatch({ type: "DELETE_SESSION", sessionID })
        return
      }
      dispatch({ type: "DETACH_SESSION", sessionID })
    },
    [dispatch, sessions],
  )

  const rename = useCallback(
    async (sessionID: string, title: string) => {
      const directory = sessions.find((item) => item.id === sessionID)?.directory
      const session = await updateSession(sessionID, { title }, directory)
      dispatch({ type: "UPDATE_SESSION", session })
    },
    [dispatch, sessions],
  )

  const fork = useCallback(
    async (sessionID: string, messageID: string) => {
      const directory = sessions.find((item) => item.id === sessionID)?.directory
      const session = await forkSession(sessionID, messageID, directory)
      dispatch({ type: "ADD_SESSION", session })
      dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: session.directory ?? directory ?? null })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
      return session
    },
    [dispatch, sessions],
  )

  const setActive = useCallback(
    (sessionID: string | null) => {
      const session = sessions.find((item) => item.id === sessionID)
      dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: session?.directory ?? null })
      dispatch({ type: "SET_ACTIVE_SESSION", sessionID })
    },
    [dispatch, sessions],
  )

  useEffect(() => {
    load()
  }, [load])

  return {
    sessions: visibleSessions,
    allSessions: sessions,
    activeSessionID,
    load,
    create,
    remove,
    rename,
    fork,
    setActive,
  }
}
