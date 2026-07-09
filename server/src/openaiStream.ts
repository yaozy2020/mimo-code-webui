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

export async function streamOpenAICompatible(input: OpenAIStreamInput, handlers: OpenAIStreamHandlers) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (input.model.apiKey) headers.Authorization = `Bearer ${input.model.apiKey}`

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
    throw new Error(text || `OpenAI-compatible stream failed: HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("OpenAI-compatible stream returned no response body")

  handlers.onStart?.()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (!data || data === "[DONE]") continue

      const chunk = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
        error?: { message?: string }
      }
      const error = extractErrorMessage(chunk)
      if (error) {
        handlers.onError?.(error)
        throw new Error(error)
      }

      const text = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content
      if (text) handlers.onDelta(text)
    }
  }

  handlers.onDone?.()
}
