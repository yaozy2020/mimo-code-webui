import { fetchJson } from "./client"
import type { Message, MessagePart, Session, TodoItem } from "@/types"

export interface SessionListResponse {
  sessions?: Session[]
  data?: Session[]
}

function isEmptySession(session: Session) {
  return !session.title || session.title.startsWith("New session - ")
}

function sortSessions(sessions: Session[]) {
  return [...sessions].sort((a, b) => {
    const emptyA = isEmptySession(a)
    const emptyB = isEmptySession(b)
    if (emptyA !== emptyB) return emptyA ? 1 : -1
    return (b.time?.updated ?? b.time?.created ?? 0) - (a.time?.updated ?? a.time?.created ?? 0)
  })
}

export async function listSessions(): Promise<Session[]> {
  const result = await fetchJson<SessionListResponse | Session[]>("/session")
  if (Array.isArray(result)) return sortSessions(result)
  return sortSessions(result.sessions ?? result.data ?? [])
}

export async function createSession(directory?: string): Promise<Session> {
  const body: Record<string, unknown> = {}
  if (directory) body.directory = directory
  return fetchJson<Session>("/session", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function getSession(sessionID: string): Promise<Session> {
  return fetchJson<Session>(`/session/${sessionID}`)
}

interface RawMessage {
  info: {
    id: string
    sessionID: string
    role: string
    time?: { created?: number }
  }
  parts: Array<{
    id: string
    type: string
    text?: string
    content?: string
    mime?: string
    url?: string
    filename?: string
    tool?: string
    callID?: string
    state?: MessagePart["state"]
  }>
}

function rawToMessage(raw: RawMessage): Message {
  const { info, parts } = raw
  const textParts = parts.filter((p) => p.type === "text")
  const content = textParts.map((p) => p.text ?? p.content ?? "").join("\n\n")
  const reasoning = parts.find((p) => p.type === "reasoning")
  const thinking = reasoning?.text ?? reasoning?.content
  const mappedParts: MessagePart[] = parts
    .filter((p) => ["text", "image", "audio", "video", "file", "reasoning", "tool"].includes(p.type))
    .map((p) => ({
      id: p.id,
      type: p.type as MessagePart["type"],
      content: p.text ?? p.content,
      mime: p.mime,
      url: p.url,
      filename: p.filename,
      tool: p.tool,
      callID: p.callID,
      state: p.state,
    }))

  return {
    id: info.id,
    sessionID: info.sessionID,
    role: info.role === "user" ? "user" : "assistant",
    content,
    thinking,
    parts: mappedParts,
    time: { created: info.time?.created },
  }
}

export async function getMessages(sessionID: string, limit = 50, before?: string): Promise<Message[]> {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  if (before) params.set("before", before)
  const result = await fetchJson<RawMessage[] | {
    messages?: RawMessage[]
    data?: RawMessage[]
  }>(`/session/${sessionID}/message?${params.toString()}`)
  if (Array.isArray(result)) return result.map(rawToMessage)
  const rawMessages = result.messages ?? result.data ?? []
  return rawMessages.map(rawToMessage)
}

export async function getTodos(sessionID: string): Promise<TodoItem[]> {
  return fetchJson<TodoItem[]>(`/session/${sessionID}/todo`)
}

export async function deleteSession(sessionID: string): Promise<void> {
  await fetchJson(`/session/${sessionID}`, { method: "DELETE" })
}

export async function updateSession(sessionID: string, updates: Partial<Session>): Promise<Session> {
  return fetchJson<Session>(`/session/${sessionID}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  })
}

export async function forkSession(sessionID: string, messageID: string): Promise<Session> {
  return fetchJson<Session>(`/session/${sessionID}/fork`, {
    method: "POST",
    body: JSON.stringify({ messageID }),
  })
}
