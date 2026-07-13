import { fetchJson } from "./client"
import { orderMessages } from "../lib/messageOrder"
import type { Message, MessagePart, Session, SnapshotFileDiff, TodoItem } from "@/types"

export interface SessionListResponse {
  sessions?: Session[]
  data?: Session[]
}

export interface SessionRuntimeStatus {
  type: "idle" | "busy" | "retry" | string
}

export interface ExperimentalSessionListResponse {
  sessions?: unknown[]
  data?: unknown[]
  results?: unknown[]
}

function normalizeExperimentalSessions(items: unknown[]) {
  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    if ("id" in item && typeof item.id === "string") return [item as Session]
    if ("session" in item) {
      const session = item.session
      if (typeof session === "object" && session !== null && "id" in session && typeof session.id === "string") {
        return [session as Session]
      }
    }
    return []
  })
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

export function withDirectory(path: string, directory?: string) {
  const value = directory?.trim()
  if (!value) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}directory=${encodeURIComponent(value)}`
}

export async function listSessions(directory?: string): Promise<Session[]> {
  const result = await fetchJson<SessionListResponse | Session[]>(withDirectory("/session", directory))
  if (Array.isArray(result)) return sortSessions(result)
  return sortSessions(result.sessions ?? result.data ?? [])
}

export async function getSessionStatuses(directory?: string): Promise<Record<string, SessionRuntimeStatus>> {
  return fetchJson<Record<string, SessionRuntimeStatus>>(withDirectory("/session/status", directory))
}

export async function discoverSessions(): Promise<Session[]> {
  try {
    const result = await fetchJson<ExperimentalSessionListResponse | Session[]>("/experimental/session?limit=100")
    if (Array.isArray(result)) return sortSessions(normalizeExperimentalSessions(result))
    return sortSessions(normalizeExperimentalSessions(result.sessions ?? result.data ?? result.results ?? []))
  } catch {
    return listSessions()
  }
}

export async function createSession(input: { directory?: string; title?: string } = {}): Promise<Session> {
  return fetchJson<Session>(withDirectory("/session", input.directory), {
    method: "POST",
    body: JSON.stringify(input.title ? { title: input.title } : {}),
  })
}

export async function getSession(sessionID: string, directory?: string): Promise<Session> {
  return fetchJson<Session>(withDirectory(`/session/${sessionID}`, directory))
}

interface RawMessage {
  info: {
    id: string
    sessionID: string
    role: string
    providerID?: string
    modelID?: string
    tokens?: Message["tokens"]
    time?: { created?: number }
    error?: { name?: string; message?: string; data?: { message?: string } }
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
  const textContent = textParts.map((p) => p.text ?? p.content ?? "").join("\n\n")
  const errorMessage = info.error?.data?.message || info.error?.message || info.error?.name
  const content = textContent || (errorMessage ? `模型调用失败：${errorMessage}` : "")
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
    providerID: info.providerID,
    modelID: info.modelID,
    tokens: info.tokens,
    time: { created: info.time?.created },
  }
}

export async function getMessages(sessionID: string, limit = 50, before?: string, directory?: string): Promise<Message[]> {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  if (before) params.set("before", before)
  const result = await fetchJson<RawMessage[] | {
    messages?: RawMessage[]
    data?: RawMessage[]
  }>(withDirectory(`/session/${sessionID}/message?${params.toString()}`, directory))
  if (Array.isArray(result)) return result.map(rawToMessage)
  const rawMessages = result.messages ?? result.data ?? []
  return rawMessages.map(rawToMessage)
}

export async function collectMessagePages(input: {
  pageSize: number
  maxMessages: number
  loadPage: (before?: string) => Promise<Message[]>
}): Promise<Message[]> {
  const allMessages: Message[] = []
  const seen = new Set<string>()
  let before: string | undefined

  while (allMessages.length < input.maxMessages) {
    let page: Message[]
    try {
      page = await input.loadPage(before)
    } catch (error) {
      if (allMessages.length > 0) break
      throw error
    }
    const newMessages = page.filter((message) => !seen.has(message.id))
    for (const message of newMessages) seen.add(message.id)
    allMessages.push(...newMessages)

    if (page.length < input.pageSize || newMessages.length === 0) break
    before = orderMessages(page)[0]?.id
    if (!before) break
  }

  return orderMessages(allMessages).slice(-input.maxMessages)
}

export async function getRecentMessages(sessionID: string, directory?: string, maxMessages = 500): Promise<Message[]> {
  const pageSize = 100
  return collectMessagePages({
    pageSize,
    maxMessages,
    loadPage: (before) => getMessages(sessionID, pageSize, before, directory),
  })
}

export async function getTodos(sessionID: string, directory?: string): Promise<TodoItem[]> {
  return fetchJson<TodoItem[]>(withDirectory(`/session/${sessionID}/todo`, directory))
}

export async function getSessionDiff(sessionID: string, messageID: string, directory?: string): Promise<SnapshotFileDiff[]> {
  return fetchJson<SnapshotFileDiff[]>(withDirectory(`/session/${sessionID}/diff?messageID=${encodeURIComponent(messageID)}`, directory))
}

export async function deleteSession(sessionID: string, directory?: string): Promise<void> {
  await fetchJson(withDirectory(`/session/${sessionID}`, directory), { method: "DELETE" })
}

export async function updateSession(sessionID: string, updates: Partial<Session>, directory?: string): Promise<Session> {
  return fetchJson<Session>(withDirectory(`/session/${sessionID}`, directory), {
    method: "PATCH",
    body: JSON.stringify(updates),
  })
}

export async function forkSession(sessionID: string, messageID: string, directory?: string): Promise<Session> {
  return fetchJson<Session>(withDirectory(`/session/${sessionID}/fork`, directory), {
    method: "POST",
    body: JSON.stringify({ messageID }),
  })
}
