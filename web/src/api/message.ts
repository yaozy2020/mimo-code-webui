import { fetchJson } from "./client"
import { withDirectory } from "./session"
import type { MessagePart, PermissionRequest, QuestionRequest } from "@/types"

export interface PromptPart {
  id?: string
  type: "text" | "image" | "audio" | "video" | "file"
  content?: string
  mime?: string
  url?: string
  filename?: string
  size?: number
}

function partToPayload(part: PromptPart) {
  if (part.type === "text") return { type: "text", text: part.content ?? "" }
  if (part.type === "file") {
    return {
      type: "file",
      mime: part.mime ?? "application/octet-stream",
      filename: part.filename,
      url: part.url ?? "",
    }
  }
  return part
}

export function modelSelectionToPayload(model?: string) {
  if (!model) return undefined
  const [providerID, modelID] = model.includes("/") ? model.split("/", 2) : ["mimo", model]
  return { providerID, modelID }
}

export async function sendPrompt(
  sessionID: string,
  input: {
    agent?: string
    model?: string
    parts: PromptPart[]
    variant?: string
    directory?: string
  },
) {
  return fetchJson(withDirectory(`/session/${sessionID}/prompt_async`, input.directory), {
    method: "POST",
    body: JSON.stringify({
      sessionID,
      agent: input.agent ?? "build",
      model: modelSelectionToPayload(input.model),
      parts: input.parts.map(partToPayload),
      variant: input.variant,
    }),
  })
}

export async function abortSession(sessionID: string, directory?: string): Promise<void> {
  await fetchJson(withDirectory(`/session/${sessionID}/abort`, directory), { method: "POST" })
}

export async function sendCommand(sessionID: string, command: string, args: string, directory?: string): Promise<void> {
  await fetchJson(withDirectory(`/session/${sessionID}/command`, directory), {
    method: "POST",
    body: JSON.stringify({ command, arguments: args }),
  })
}

export async function respondPermission(
  permissionID: string,
  response: "once" | "always" | "reject",
  options?: { message?: string; sessionID?: string; directory?: string },
): Promise<void> {
  await fetchJson(withDirectory(`/permission/${permissionID}/reply`, options?.directory), {
    method: "POST",
    body: JSON.stringify({
      reply: response,
      message: options?.message,
    }),
  })
}

export async function listPermissions(directory?: string): Promise<PermissionRequest[]> {
  return fetchJson<PermissionRequest[]>(withDirectory("/permission", directory))
}

export async function listQuestions(directory?: string): Promise<QuestionRequest[]> {
  return fetchJson<QuestionRequest[]>(withDirectory("/question", directory))
}

export async function respondQuestion(
  requestID: string,
  answers: string[][],
  directory?: string,
): Promise<void> {
  await fetchJson(withDirectory(`/question/${requestID}/reply`, directory), {
    method: "POST",
    body: JSON.stringify({
      answers,
    }),
  })
}

export async function rejectQuestion(requestID: string, directory?: string): Promise<void> {
  await fetchJson(withDirectory(`/question/${requestID}/reject`, directory), { method: "POST" })
}

export function partsToText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is MessagePart & { content: string } => p.type === "text" && typeof p.content === "string")
    .map((p) => p.content)
    .join("")
}
