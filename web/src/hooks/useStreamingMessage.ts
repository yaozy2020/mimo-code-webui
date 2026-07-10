import { AuthRequiredError, createEventStream } from "@/api/client"
import { getRecentMessages, getTodos } from "@/api/session"
import type { Message, PermissionRequest, QuestionRequest, SnapshotFileDiff, StreamEvent } from "@/types"
import { useAppDispatch, useAppState } from "@/stores/appStore"
import { useEffect, useRef } from "react"

export function useStreamingMessage() {
  const dispatch = useAppDispatch()
  const { activeSessionID, sessions, agentStatus } = useAppState()
  const activeDirectory = activeSessionID ? sessions.find((session) => session.id === activeSessionID)?.directory : undefined
  const abortRef = useRef<AbortController | null>(null)
  const activeSessionRef = useRef<string | null>(activeSessionID)
  const activeDirectoryRef = useRef<string | undefined>(activeDirectory)
  const agentStatusRef = useRef(agentStatus)

  useEffect(() => {
    activeSessionRef.current = activeSessionID
    activeDirectoryRef.current = activeDirectory
    agentStatusRef.current = agentStatus
  }, [activeDirectory, activeSessionID, agentStatus])

  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort

    createEventStream(
      abort.signal,
      (event: StreamEvent) => {
        handleEvent(event, dispatch, {
          getActiveSessionID: () => activeSessionRef.current,
          getActiveDirectory: () => activeDirectoryRef.current,
          signal: abort.signal,
          isSessionBusy: (sessionID) => agentStatusRef.current[sessionID]?.state === "busy",
        })
      },
      (error) => {
        if (error instanceof AuthRequiredError) {
          dispatch({ type: "SET_AUTH_REQUIRED", required: true })
          dispatch({ type: "SET_AUTH_DIALOG_OPEN", open: true })
        }
        console.error("[streaming] error:", error)
      },
      activeDirectory,
    )

    return () => {
      abort.abort()
    }
  }, [activeDirectory, dispatch])

  return {
    disconnect: () => abortRef.current?.abort(),
  }
}

interface StreamEventContext {
  getActiveSessionID: () => string | null
  getActiveDirectory: () => string | undefined
  signal: AbortSignal
  isSessionBusy: (sessionID: string) => boolean
}

function syncSessionSnapshot(
  sessionID: string,
  directory: string | undefined,
  dispatch: ReturnType<typeof useAppDispatch>,
  context: StreamEventContext,
) {
  window.setTimeout(() => {
    void (async () => {
      if (context.signal.aborted) return
      if (context.isSessionBusy(sessionID)) {
        return
      }
      try {
        const [messages, todos] = await Promise.all([getRecentMessages(sessionID, directory), getTodos(sessionID, directory)])
        if (context.signal.aborted) return
        dispatch({ type: "SET_MESSAGES", sessionID, messages })
        dispatch({ type: "SET_TODOS", sessionID, todos })
      } catch (error) {
        if (!context.signal.aborted) console.error("[streaming] failed to sync session snapshot:", error)
      }
    })()
  }, 250)
}

function getSessionErrorMessage(error: { name?: string; message?: string; data?: { message?: string } } | undefined) {
  return error?.data?.message || error?.message || error?.name || "模型执行失败"
}

function handleEvent(event: StreamEvent, dispatch: ReturnType<typeof useAppDispatch>, context: StreamEventContext) {
  switch (event.type) {
    case "message.updated": {
      const props = event.properties as { sessionID: string; info: Message }
      const message = props.info
      dispatch({ type: "ADD_MESSAGE", sessionID: props.sessionID, message })
      break
    }
    case "message.part.updated": {
      const props = event.properties as {
        sessionID: string
        part: { id: string; messageID: string; type: string; content?: string; text?: string }
      }
      const text = props.part.type === "text" ? props.part.text || props.part.content : undefined
      if (text) {
        dispatch({
          type: "SET_MESSAGE_CONTENT",
          sessionID: props.sessionID,
          messageID: props.part.messageID,
          content: text,
        })
      }
      break
    }
    case "message.part.delta": {
      const props = event.properties as { sessionID: string; messageID: string; partID: string; delta: string }
      dispatch({
        type: "APPEND_MESSAGE_CONTENT",
        sessionID: props.sessionID,
        messageID: props.messageID,
        content: props.delta,
      })
      break
    }
    case "session.updated":
    case "session.status": {
      const props = event.properties as {
        sessionID: string
        info?: { state?: string }
        status?: { state?: string; type?: string }
      }
      const state = props.status?.state ?? props.status?.type ?? props.info?.state ?? "idle"
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: props.sessionID,
        status: { sessionID: props.sessionID, state: mapAgentState(state) },
      })
      break
    }
    case "session.idle": {
      const props = event.properties as { sessionID?: string }
      if (!props.sessionID) break
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: props.sessionID,
        status: { sessionID: props.sessionID, state: "idle" },
      })
      if (props.sessionID === context.getActiveSessionID()) {
        syncSessionSnapshot(props.sessionID, context.getActiveDirectory(), dispatch, context)
      }
      break
    }
    case "session.error": {
      const props = event.properties as {
        sessionID?: string
        error?: { name?: string; message?: string; data?: { message?: string } }
      }
      if (!props.sessionID) break
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: props.sessionID,
        status: { sessionID: props.sessionID, state: "idle" },
      })
      const message: Message = {
        id: `error-${props.sessionID}-${Date.now()}`,
        sessionID: props.sessionID,
        role: "assistant",
        content: `模型调用失败：${getSessionErrorMessage(props.error)}`,
        errorKey: `${props.sessionID}:${getSessionErrorMessage(props.error)}`,
        time: { created: Date.now() },
      }
      dispatch({ type: "ADD_MESSAGE", sessionID: props.sessionID, message })
      break
    }
    case "permission.asked": {
      const permission = event.properties as PermissionRequest
      dispatch({ type: "UPSERT_PENDING_PERMISSION", permission })
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: permission.sessionID,
        status: { sessionID: permission.sessionID, state: "waiting_for_permission" },
      })
      break
    }
    case "permission.replied": {
      const props = event.properties as { requestID?: string }
      if (props.requestID) dispatch({ type: "CLEAR_PENDING_PERMISSION", permissionID: props.requestID })
      break
    }
    case "question.asked": {
      const question = event.properties as QuestionRequest
      dispatch({ type: "UPSERT_PENDING_QUESTION", question })
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: question.sessionID,
        status: { sessionID: question.sessionID, state: "waiting_for_question" },
      })
      break
    }
    case "question.replied":
    case "question.rejected": {
      const props = event.properties as { requestID?: string }
      if (props.requestID) dispatch({ type: "CLEAR_PENDING_QUESTION", requestID: props.requestID })
      break
    }
    case "todo.updated": {
      const props = event.properties as {
        sessionID: string
        todos?: { id?: string; content: string; status?: string; completed?: boolean }[]
        items?: { id?: string; content: string; status?: string; completed?: boolean }[]
      }
      dispatch({ type: "SET_TODOS", sessionID: props.sessionID, todos: props.todos ?? props.items ?? [] })
      break
    }
    case "session.diff": {
      const props = event.properties as { sessionID: string; diff: SnapshotFileDiff[] }
      dispatch({ type: "SET_SESSION_DIFF", sessionID: props.sessionID, diff: props.diff })
      break
    }
    default:
      // Ignore unknown events
      break
  }
}

function mapAgentState(state: string): "idle" | "busy" | "waiting_for_permission" | "waiting_for_question" {
  if (state === "busy" || state === "running") return "busy"
  if (state === "waiting_for_permission") return "waiting_for_permission"
  if (state === "waiting_for_question") return "waiting_for_question"
  return "idle"
}
