import React, { createContext, useContext, useReducer } from "react"
import type {
  AgentStatus,
  ContextUsage,
  GitStatus,
  Message,
  PermissionRequest,
  QuestionRequest,
  SnapshotFileDiff,
  Session,
  TodoItem,
} from "@/types"

interface AppState {
  sessions: Session[]
  activeSessionID: string | null
  messages: Record<string, Message[]>
  status: {
    mimoHealthy: boolean
    mimoUrl: string
    mimoVersion?: string
    mimoManaged: boolean
  }
  agentStatus: Record<string, AgentStatus>
  contextUsage: Record<string, ContextUsage>
  gitStatus: GitStatus
  todos: Record<string, TodoItem[]>
  sessionDiffs: Record<string, SnapshotFileDiff[]>
  pendingPermission: PermissionRequest | null
  pendingQuestion: QuestionRequest | null
  authRequired: boolean
  authDialogOpen: boolean
  settings: {
    apiKey: string
    baseUrl: string
    model: string
    theme: "light" | "dark"
    authToken: string
  }
}

const ACTIVE_SESSION_KEY = "mimo-webui-active-session"
const OWNED_SESSION_IDS_KEY = "mimo-webui-owned-session-ids"

function getOwnedSessionIDs() {
  try {
    const value = localStorage.getItem(OWNED_SESSION_IDS_KEY)
    if (!value) return new Set<string>()
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set<string>()
  }
}

function setOwnedSessionIDs(ids: Set<string>) {
  localStorage.setItem(OWNED_SESSION_IDS_KEY, JSON.stringify([...ids]))
}

function rememberOwnedSessionID(sessionID: string) {
  const ids = getOwnedSessionIDs()
  ids.add(sessionID)
  setOwnedSessionIDs(ids)
}

function forgetOwnedSessionID(sessionID: string) {
  const ids = getOwnedSessionIDs()
  ids.delete(sessionID)
  setOwnedSessionIDs(ids)
}

function getInitialActiveSessionID() {
  const sessionID = localStorage.getItem(ACTIVE_SESSION_KEY)
  if (!sessionID) return null
  return getOwnedSessionIDs().has(sessionID) ? sessionID : null
}

type AppAction =
  | { type: "SET_SESSIONS"; sessions: Session[] }
  | { type: "ADD_SESSION"; session: Session }
  | { type: "UPDATE_SESSION"; session: Session }
  | { type: "DELETE_SESSION"; sessionID: string }
  | { type: "SET_ACTIVE_SESSION"; sessionID: string | null }
  | { type: "SET_MESSAGES"; sessionID: string; messages: Message[] }
  | { type: "ADD_MESSAGE"; sessionID: string; message: Message }
  | { type: "UPDATE_MESSAGE"; sessionID: string; message: Message }
  | { type: "APPEND_MESSAGE_CONTENT"; sessionID: string; messageID: string; content: string }
  | { type: "SET_MESSAGE_CONTENT"; sessionID: string; messageID: string; content: string }
  | { type: "SET_STATUS"; status: AppState["status"] }
  | { type: "SET_AGENT_STATUS"; sessionID: string; status: AgentStatus }
  | { type: "SET_CONTEXT_USAGE"; sessionID: string; usage: ContextUsage }
  | { type: "SET_GIT_STATUS"; status: GitStatus }
  | { type: "SET_TODOS"; sessionID: string; todos: TodoItem[] }
  | { type: "SET_SESSION_DIFF"; sessionID: string; diff: SnapshotFileDiff[] }
  | { type: "SET_PENDING_PERMISSION"; permission: PermissionRequest | null }
  | { type: "CLEAR_PENDING_PERMISSION"; permissionID: string }
  | { type: "SET_PENDING_QUESTION"; question: QuestionRequest | null }
  | { type: "CLEAR_PENDING_QUESTION"; requestID: string }
  | { type: "SET_AUTH_REQUIRED"; required: boolean }
  | { type: "SET_AUTH_DIALOG_OPEN"; open: boolean }
  | { type: "UPDATE_SETTINGS"; settings: Partial<AppState["settings"]> }

const initialState: AppState = {
  sessions: [],
  activeSessionID: getInitialActiveSessionID(),
  messages: {},
  status: {
    mimoHealthy: false,
    mimoUrl: "http://127.0.0.1:4096",
    mimoManaged: false,
  },
  agentStatus: {},
  contextUsage: {},
  gitStatus: { added: 0, modified: 0, deleted: 0 },
  todos: {},
  sessionDiffs: {},
  pendingPermission: null,
  pendingQuestion: null,
  authRequired: false,
  authDialogOpen: false,
  settings: {
    apiKey: localStorage.getItem("mimo-webui-apikey") || "",
    baseUrl: localStorage.getItem("mimo-webui-baseurl") || "https://token-plan-sgp.xiaomimimo.com/anthropic",
    model: localStorage.getItem("mimo-webui-model") || "mimo-auto",
    theme: (localStorage.getItem("mimo-webui-theme") as "light" | "dark") || "light",
    authToken: localStorage.getItem("mimo-webui-auth-token") || "",
  },
}

function messageSignature(message: Message) {
  return `${message.role}:${message.content ?? ""}`
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SESSIONS":
      return { ...state, sessions: action.sessions }
    case "ADD_SESSION":
      rememberOwnedSessionID(action.session.id)
      return { ...state, sessions: [action.session, ...state.sessions] }
    case "UPDATE_SESSION": {
      const sessions = state.sessions.map((s) => (s.id === action.session.id ? action.session : s))
      return { ...state, sessions }
    }
    case "DELETE_SESSION":
      forgetOwnedSessionID(action.sessionID)
      if (state.activeSessionID === action.sessionID) localStorage.removeItem(ACTIVE_SESSION_KEY)
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionID),
        activeSessionID: state.activeSessionID === action.sessionID ? null : state.activeSessionID,
      }
    case "SET_ACTIVE_SESSION":
      if (action.sessionID) {
        rememberOwnedSessionID(action.sessionID)
        localStorage.setItem(ACTIVE_SESSION_KEY, action.sessionID)
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY)
      }
      return { ...state, activeSessionID: action.sessionID }
    case "SET_MESSAGES": {
      const existing = state.messages[action.sessionID] || []
      const loadedIds = new Set(action.messages.map((message) => message.id))
      const loadedSignatures = new Set(action.messages.map(messageSignature))
      const optimisticMessages = existing.filter(
        (message) => !loadedIds.has(message.id) && !loadedSignatures.has(messageSignature(message)),
      )
      return { ...state, messages: { ...state.messages, [action.sessionID]: [...action.messages, ...optimisticMessages] } }
    }
    case "ADD_MESSAGE": {
      const existing = state.messages[action.sessionID] || []
      const exists = existing.some((message) => message.id === action.message.id)
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.sessionID]: exists
            ? existing.map((message) => (message.id === action.message.id ? { ...message, ...action.message } : message))
            : [...existing, action.message],
        },
      }
    }
    case "UPDATE_MESSAGE": {
      const msgs = state.messages[action.sessionID] || []
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.sessionID]: msgs.map((m) => (m.id === action.message.id ? action.message : m)),
        },
      }
    }
    case "APPEND_MESSAGE_CONTENT": {
      const msgs = state.messages[action.sessionID] || []
      const exists = msgs.some((m) => m.id === action.messageID)
      const nextMessages = exists
        ? msgs.map((m) =>
            m.id === action.messageID ? { ...m, content: (m.content || "") + action.content } : m,
          )
        : [
            ...msgs,
            {
              id: action.messageID,
              sessionID: action.sessionID,
              role: "assistant" as const,
              content: action.content,
              time: { created: Date.now() },
            },
          ]
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.sessionID]: nextMessages,
        },
      }
    }
    case "SET_MESSAGE_CONTENT": {
      const msgs = state.messages[action.sessionID] || []
      const exists = msgs.some((m) => m.id === action.messageID)
      const nextMessages = exists
        ? msgs.map((m) => (m.id === action.messageID ? { ...m, content: action.content } : m))
        : [
            ...msgs,
            {
              id: action.messageID,
              sessionID: action.sessionID,
              role: "assistant" as const,
              content: action.content,
              time: { created: Date.now() },
            },
          ]
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.sessionID]: nextMessages,
        },
      }
    }
    case "SET_STATUS":
      return { ...state, status: action.status }
    case "SET_AGENT_STATUS":
      return { ...state, agentStatus: { ...state.agentStatus, [action.sessionID]: action.status } }
    case "SET_CONTEXT_USAGE":
      return { ...state, contextUsage: { ...state.contextUsage, [action.sessionID]: action.usage } }
    case "SET_GIT_STATUS":
      return { ...state, gitStatus: action.status }
    case "SET_TODOS":
      return { ...state, todos: { ...state.todos, [action.sessionID]: action.todos } }
    case "SET_SESSION_DIFF":
      return { ...state, sessionDiffs: { ...state.sessionDiffs, [action.sessionID]: action.diff } }
    case "SET_PENDING_PERMISSION":
      return { ...state, pendingPermission: action.permission }
    case "CLEAR_PENDING_PERMISSION":
      return state.pendingPermission?.id === action.permissionID ? { ...state, pendingPermission: null } : state
    case "SET_PENDING_QUESTION":
      return { ...state, pendingQuestion: action.question }
    case "CLEAR_PENDING_QUESTION":
      return state.pendingQuestion?.id === action.requestID ? { ...state, pendingQuestion: null } : state
    case "SET_AUTH_REQUIRED":
      return { ...state, authRequired: action.required }
    case "SET_AUTH_DIALOG_OPEN":
      return { ...state, authDialogOpen: action.open }
    case "UPDATE_SETTINGS": {
      const next = { ...state.settings, ...action.settings }
      if (action.settings.apiKey !== undefined) localStorage.setItem("mimo-webui-apikey", next.apiKey)
      if (action.settings.baseUrl !== undefined) localStorage.setItem("mimo-webui-baseurl", next.baseUrl)
      if (action.settings.model !== undefined) localStorage.setItem("mimo-webui-model", next.model)
      if (action.settings.theme !== undefined) {
        localStorage.setItem("mimo-webui-theme", next.theme)
        document.documentElement.classList.toggle("dark", next.theme === "dark")
      }
      if (action.settings.authToken !== undefined) localStorage.setItem("mimo-webui-auth-token", next.authToken)
      return { ...state, settings: next }
    }
    default:
      return state
  }
}

const AppStateContext = createContext<AppState | null>(null)
const AppDispatchContext = createContext<React.Dispatch<AppAction> | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  )
}

export function useAppState() {
  const context = useContext(AppStateContext)
  if (!context) throw new Error("useAppState must be used within AppProvider")
  return context
}

export function useAppDispatch() {
  const context = useContext(AppDispatchContext)
  if (!context) throw new Error("useAppDispatch must be used within AppProvider")
  return context
}
