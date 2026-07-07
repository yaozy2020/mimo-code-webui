export interface MimoConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface ServerStatus {
  available: boolean
  version?: string
  url: string
  mimoPath?: string
  pid?: number
}

export interface Session {
  id: string
  title?: string
  directory?: string
  time?: {
    created?: number
    updated?: number
  }
}

export interface Message {
  id: string
  sessionID: string
  role: "user" | "assistant"
  content?: string
  parts?: MessagePart[]
  thinking?: string
  toolCalls?: ToolCall[]
  providerID?: string
  modelID?: string
  tokens?: {
    total?: number
    input?: number
    output?: number
    reasoning?: number
    cache?: {
      read?: number
      write?: number
    }
  }
  optimistic?: boolean
  errorKey?: string
  time?: {
    created?: number
  }
}

export interface MessagePart {
  id: string
  type: "text" | "image" | "audio" | "video" | "file" | "reasoning" | "tool"
  content?: string
  text?: string
  mime?: string
  url?: string
  filename?: string
  tool?: string
  callID?: string
  state?: {
    status?: string
    input?: unknown
    output?: unknown
    error?: string
  }
}

export interface SnapshotFileDiff {
  file: string
  patch: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: unknown
  status?: "pending" | "running" | "completed" | "failed"
}

export interface PermissionRequest {
  id: string
  sessionID: string
  permission?: string
  patterns?: string[]
  metadata?: Record<string, unknown>
  always?: string[]
  toolName?: string
  title?: string
  description?: string
  input?: Record<string, unknown>
  agent?: string
  tool?: {
    messageID: string
    callID: string
  }
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  }
}

export interface QuestionInfo {
  header: string
  question: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
  key?: string
  params?: Record<string, string>
}

export interface QuestionOption {
  label: string
  description: string
}

export interface AgentStatus {
  sessionID?: string
  state: "idle" | "busy" | "waiting_for_permission" | "waiting_for_question"
}

export interface ContextUsage {
  usedTokens?: number
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
}

export interface GitStatus {
  added: number
  modified: number
  deleted: number
}

export interface TodoItem {
  id?: string
  content: string
  status?: "pending" | "in_progress" | "completed" | "cancelled" | string
  completed?: boolean
}

export type StreamEvent =
  | { type: "message.part.delta"; properties: { sessionID: string; messageID: string; partID: string; delta: string } }
  | { type: "message.part.updated"; properties: { sessionID: string; part: MessagePart } }
  | { type: "message.updated"; properties: { sessionID: string; info: Message } }
  | { type: "session.updated"; properties: { sessionID: string; info?: { state?: string }; status?: { state?: string } } }
  | { type: "session.error"; properties: { sessionID: string; error?: { name?: string; message?: string; data?: { message?: string } } } }
  | { type: "permission.asked"; properties: PermissionRequest }
  | { type: "permission.replied"; properties: { sessionID: string; requestID: string; reply?: "once" | "always" | "reject" } }
  | { type: "question.asked"; properties: QuestionRequest }
  | { type: "question.replied"; properties: { sessionID: string; requestID: string; answers: string[][] } }
  | { type: "question.rejected"; properties: { sessionID: string; requestID: string } }
  | { type: "session.status"; properties: { sessionID: string; status: AgentStatus } }
  | { type: "todo.updated"; properties: { sessionID: string; todos?: TodoItem[]; items?: TodoItem[] } }
  | { type: "session.diff"; properties: { sessionID: string; diff: SnapshotFileDiff[] } }
  | { type: string; properties: Record<string, unknown> }
