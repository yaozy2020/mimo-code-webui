import type { StreamEvent } from "@/types"

const API_BASE = "/api"

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("mimo-webui-auth-token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
  })

  if (response.status === 401) {
    const data = (await response.json().catch(() => ({}))) as { authRequired?: boolean }
    if (data.authRequired) {
      throw new AuthRequiredError("Authentication required")
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error")
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthRequiredError"
  }
}

export function createEventStream(
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void,
  directory?: string,
) {
  let cancelled = false
  let retryDelay = 1000

  const waitForRetry = (ms: number) =>
    new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, ms)
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout)
          resolve()
        },
        { once: true },
      )
    })

  const connect = async () => {
    try {
      const eventPath = directory ? `/global/event?directory=${encodeURIComponent(directory)}` : "/global/event"
      const response = await fetch(`${API_BASE}${eventPath}`, {
        signal,
        credentials: "same-origin",
        headers: getAuthHeaders(),
      })

      if (response.status === 401) {
        onError?.(new AuthRequiredError("Authentication required"))
        return false
      }

      if (!response.ok) {
        onError?.(new Error(`HTTP ${response.status}`))
        return true
      }

      retryDelay = 1000

      const reader = response.body?.getReader()
      if (!reader) {
        onError?.(new Error("No response body"))
        return true
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const raw of lines) {
          const line = raw.trim()
          if (!line || !line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") continue
          try {
            const wrapper = JSON.parse(data) as { payload?: StreamEvent; syncEvent?: unknown }
            const event = wrapper.payload
            if (!event) continue
            onEvent(event)
          } catch (error) {
            console.warn("[events] failed to parse event:", data, error)
          }
        }
      }
      return !cancelled && !signal.aborted
    } catch (error) {
      if (!cancelled) {
        onError?.(error instanceof Error ? error : new Error(String(error)))
      }
      return !cancelled && !signal.aborted
    }
  }

  const run = async () => {
    while (!cancelled && !signal.aborted) {
      const shouldRetry = await connect()
      if (!shouldRetry || cancelled || signal.aborted) break
      await waitForRetry(retryDelay)
      retryDelay = Math.min(retryDelay * 2, 10_000)
    }
  }

  run()

  return {
    close() {
      cancelled = true
    },
  }
}

export async function fetchStatus(): Promise<Record<string, unknown>> {
  const response = await fetch("/status")
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

export async function fetchLocalStatus(): Promise<Record<string, unknown>> {
  const response = await fetch("/local-status", { credentials: "same-origin", headers: getAuthHeaders() })
  if (response.status === 401) {
    throw new AuthRequiredError("Authentication required")
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

interface RuntimeModelConfig {
  provider?: Record<
    string,
    {
      models?: Record<
        string,
        {
          name?: string
          limit?: { context?: number }
          tool_call?: boolean
          attachment?: boolean
          reasoning?: boolean
        }
      >
    }
  >
}

export interface RuntimeModel {
  id: string
  name: string
  provider: string
  baseUrl?: string
  contextLimit?: number
  source?: "template" | "runtime" | "backend" | "browser"
  tool_call?: boolean
  attachment?: boolean
  reasoning?: boolean
}

export async function fetchRuntimeModels(): Promise<RuntimeModel[]> {
  const config = await fetchJson<RuntimeModelConfig>("/api/config")
  return Object.entries(config.provider ?? {}).flatMap(([provider, info]) =>
    Object.entries(info.models ?? {}).map(([id, model]) => ({
      id,
      name: model.name ?? id,
      provider,
      contextLimit: model.limit?.context,
      tool_call: model.tool_call,
      attachment: model.attachment,
      reasoning: model.reasoning,
      source: "runtime" as const,
    })),
  )
}

interface LocalConfigModelsResponse {
  models?: Array<{ providerID: string; modelID: string; name?: string; baseUrl?: string; tool_call?: boolean; attachment?: boolean; reasoning?: boolean }>
}

interface LocalConfigModelResponse {
  model: { providerID: string; modelID: string; name: string; baseUrl?: string; tool_call?: boolean; attachment?: boolean; reasoning?: boolean }
}

const MANUAL_MODELS_KEY = "mimo-webui-manual-models"

export interface ManualModelInput {
  providerID: string
  modelID: string
  name?: string
  baseUrl?: string
  apiKey?: string
  tool_call?: boolean
  attachment?: boolean
  reasoning?: boolean
}

function readBrowserModels(): RuntimeModel[] {
  try {
    const raw = localStorage.getItem(MANUAL_MODELS_KEY)
    if (!raw) return []
    const models = JSON.parse(raw) as RuntimeModel[]
    return Array.isArray(models) ? models : []
  } catch {
    return []
  }
}

function writeBrowserModel(input: ManualModelInput): RuntimeModel {
  const model: RuntimeModel = {
    provider: input.providerID.trim(),
    id: input.modelID.trim(),
    name: input.name?.trim() || input.modelID.trim(),
    baseUrl: input.baseUrl?.trim(),
    tool_call: input.tool_call ?? true,
    attachment: input.attachment ?? true,
    reasoning: input.reasoning ?? true,
    source: "browser",
  }
  const existing = readBrowserModels().filter((item) => item.provider !== model.provider || item.id !== model.id)
  localStorage.setItem(MANUAL_MODELS_KEY, JSON.stringify([...existing, model]))
  return model
}

export async function fetchBackendModels(): Promise<RuntimeModel[]> {
  const response = await fetch("/local-config/models", { credentials: "same-origin", headers: getAuthHeaders() })
  if (!response.ok) return []
  const data = (await response.json()) as LocalConfigModelsResponse
  return (data.models ?? []).map((model) => ({
    provider: model.providerID,
    id: model.modelID,
    name: model.name ?? model.modelID,
    baseUrl: model.baseUrl,
    tool_call: model.tool_call,
    attachment: model.attachment,
    reasoning: model.reasoning,
    source: "backend",
  }))
}

export async function fetchBuiltinModelTemplates(): Promise<RuntimeModel[]> {
  const response = await fetch("/local-config/model-templates", { credentials: "same-origin", headers: getAuthHeaders() })
  if (!response.ok) return []
  const data = (await response.json()) as LocalConfigModelsResponse
  return (data.models ?? []).map((model) => ({
    provider: model.providerID,
    id: model.modelID,
    name: model.name ?? model.modelID,
    source: "template",
  }))
}

export async function fetchAvailableModels(): Promise<RuntimeModel[]> {
  const [templateModels, runtimeModels, backendModels] = await Promise.all([
    fetchBuiltinModelTemplates().catch(() => []),
    fetchRuntimeModels().catch(() => []),
    fetchBackendModels().catch(() => []),
  ])
  const models = [...templateModels, ...runtimeModels, ...backendModels, ...readBrowserModels()]
  const byKey = new Map<string, RuntimeModel>()
  for (const model of models) {
    const key = `${model.provider}/${model.id}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, model)
    } else {
      byKey.set(key, {
        ...existing,
        contextLimit: existing.contextLimit ?? model.contextLimit,
        // If any source says the model supports tools/files/reasoning, trust it.
        tool_call: existing.tool_call || model.tool_call,
        attachment: existing.attachment || model.attachment,
        reasoning: existing.reasoning || model.reasoning,
      })
    }
  }
  return [...byKey.values()]
}

export async function saveManualModel(input: ManualModelInput, writeBackend: boolean): Promise<RuntimeModel> {
  const browserModel = writeBrowserModel(input)
  if (!writeBackend) return browserModel

  const response = await fetch("/local-config/models", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  const data = (await response.json()) as LocalConfigModelResponse
  return {
    provider: data.model.providerID,
    id: data.model.modelID,
    name: data.model.name,
    baseUrl: data.model.baseUrl,
    tool_call: data.model.tool_call,
    attachment: data.model.attachment,
    reasoning: data.model.reasoning,
    source: "backend",
  }
}

export async function restartMimoServer(): Promise<{ ok: boolean; url?: string }> {
  const response = await fetch("/local-config/restart-mimo", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return response.json() as Promise<{ ok: boolean; url?: string }>
}

export async function runLocalPrompt(input: { model: string; prompt: string }): Promise<{ text: string }> {
  const response = await fetch("/local-run", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return response.json() as Promise<{ text: string }>
}

export interface LocalCliCommandResult {
  command: string
  args: string[]
  stdout: string
  stderr: string
}

export async function runReadonlyCliCommand(id: string): Promise<LocalCliCommandResult> {
  const response = await fetch(`/local-cli/commands/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return response.json() as Promise<LocalCliCommandResult>
}

export interface LocalPromptStreamHandlers {
  onStart?: () => void
  onDelta: (text: string) => void
  onError?: (message: string) => void
  onDone?: () => void
}

export async function runLocalPromptStream(
  input: { model: string; prompt: string },
  handlers: LocalPromptStreamHandlers,
) {
  const response = await fetch("/local-run/stream", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No stream body")
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (!data) continue

      const event = JSON.parse(data) as { type?: string; text?: string; error?: string }
      if (event.type === "start") handlers.onStart?.()
      if (event.type === "delta" && event.text) handlers.onDelta(event.text)
      if (event.type === "error") {
        handlers.onError?.(event.error || "模型调用失败")
        throw new Error(event.error || "模型调用失败")
      }
      if (event.type === "done") handlers.onDone?.()
    }
  }
}

export async function loginWithToken(token: string): Promise<void> {
  const response = await fetch("/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  })
  if (!response.ok) throw new Error(response.status === 401 ? "认证令牌无效" : `HTTP ${response.status}`)
}

export async function logout(): Promise<void> {
  await fetch("/logout", { method: "POST", credentials: "same-origin" })
}
