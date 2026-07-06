import { fetchJson } from "./client"
import type { MessagePart, PermissionRequest, QuestionRequest } from "@/types"

export interface PromptPart {
  id?: string
  type: "text" | "image" | "audio" | "video" | "file"
  content?: string
  mime?: string
  url?: string
  filename?: string
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
  },
) {
  return fetchJson(`/session/${sessionID}/prompt_async`, {
    method: "POST",
    body: JSON.stringify({
      sessionID,
      agent: input.agent ?? "build",
      model: modelSelectionToPayload(input.model),
      parts: input.parts.map((part) =>
        part.type === "text" ? { type: "text", text: part.content ?? "" } : part,
      ),
      variant: input.variant,
    }),
  })
}

export async function abortSession(sessionID: string): Promise<void> {
  await fetchJson(`/session/${sessionID}/abort`, { method: "POST" })
}

export async function respondPermission(
  permissionID: string,
  response: "once" | "always" | "reject",
  options?: { message?: string; sessionID?: string; directory?: string },
): Promise<void> {
  await fetchJson(`/permission/${permissionID}/reply`, {
    method: "POST",
    body: JSON.stringify({
      reply: response,
      message: options?.message,
    }),
  })
}

export async function listPermissions(): Promise<PermissionRequest[]> {
  return fetchJson<PermissionRequest[]>("/permission")
}

export async function listQuestions(): Promise<QuestionRequest[]> {
  return fetchJson<QuestionRequest[]>("/question")
}

export async function respondQuestion(
  requestID: string,
  answers: string[][],
): Promise<void> {
  await fetchJson(`/question/${requestID}/reply`, {
    method: "POST",
    body: JSON.stringify({
      answers,
    }),
  })
}

export async function rejectQuestion(requestID: string): Promise<void> {
  await fetchJson(`/question/${requestID}/reject`, { method: "POST" })
}

export function partsToText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is MessagePart & { content: string } => p.type === "text" && typeof p.content === "string")
    .map((p) => p.content)
    .join("")
}
