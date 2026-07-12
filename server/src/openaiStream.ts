import { assertPublicBaseUrlResolution } from "./config.js"

export interface OpenAIStreamModel {
  modelID: string
  baseUrl: string
  apiKey?: string
}

export interface OpenAIStreamInput {
  model: OpenAIStreamModel
  prompt: string
  signal?: AbortSignal
}

export interface OpenAIStreamHandlers {
  onStart?: () => void
  onDelta: (text: string) => void
  onError?: (message: string) => void
  onDone?: () => void
}

function chatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`
}

function extractErrorMessage(value: unknown) {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined
  const error = (value as { error?: { message?: string } | string }).error
  if (typeof error === "string") return error
  return error?.message
}

export function createOpenAIStreamError(value: unknown, fallback: string) {
  const message = extractErrorMessage(value) || fallback
  const error = new Error(message) as Error & { code?: string }
  if (typeof value === "object" && value !== null && "error" in value) {
    const detail = (value as { error?: { code?: string } }).error
    if (detail?.code === "STREAM_UNSUPPORTED") error.code = detail.code
  }
  return error
}

export async function streamOpenAICompatible(input: OpenAIStreamInput, handlers: OpenAIStreamHandlers) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (input.model.apiKey) headers.Authorization = `Bearer ${input.model.apiKey}`
  await assertPublicBaseUrlResolution(input.model.baseUrl)

  const response = await fetch(chatCompletionsUrl(input.model.baseUrl), {
    method: "POST",
    headers,
    signal: input.signal,
    redirect: "error",
    body: JSON.stringify({
      model: input.model.modelID,
      messages: [{ role: "user", content: input.prompt }],
      stream: true,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    throw createOpenAIStreamError(body, text || `OpenAI-compatible stream failed: HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("OpenAI-compatible stream returned no response body")

  handlers.onStart?.()
  const decoder = new TextDecoder()
  let buffer = ""
  let reachedEof = false
  let protocolDone = false

  const processLines = (lines: string[]) => {
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (!data) continue
      if (data === "[DONE]") {
        protocolDone = true
        return
      }

      const chunk = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        error?: { message?: string }
      }
      const error = extractErrorMessage(chunk)
      if (error) {
        const streamError = createOpenAIStreamError(chunk, error)
        if (streamError.code !== "STREAM_UNSUPPORTED") handlers.onError?.(error)
        throw streamError
      }

      const text = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content
      if (text) handlers.onDelta(text)
    }
  }

  try {
    while (!protocolDone) {
      const { done, value } = await reader.read()
      if (done) {
        reachedEof = true
        buffer += decoder.decode()
        if (buffer) processLines([buffer])
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      processLines(lines)
    }

    if (!protocolDone) {
      const error = new Error("OpenAI-compatible stream incomplete: connection ended before [DONE]") as Error & { code: string }
      error.code = "STREAM_INCOMPLETE"
      throw error
    }
    handlers.onDone?.()
  } finally {
    try {
      if (!reachedEof) void reader.cancel().catch(() => undefined)
    } catch {
      // Cleanup is best-effort and must not delay or replace protocol termination.
    }
    try {
      reader.releaseLock()
    } catch {
      // Cleanup must not replace the stream result or its primary error.
    }
  }
}
