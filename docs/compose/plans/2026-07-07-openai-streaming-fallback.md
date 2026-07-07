# OpenAI Streaming Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-layer model routing path: native MiMo streaming first, OpenAI-compatible streaming fallback second, existing non-streaming `/local-run` fallback last.

**Architecture:** Keep MiMo native `/api/session/:id/prompt_async` as the preferred path for models present in runtime config. For non-native models, add a backend `/local-run/stream` SSE endpoint that reads provider config from `~/.mimo/mimo.config.json`, calls an OpenAI-compatible chat completions stream, and emits small WebUI events consumed by the frontend. Keep `/local-run` as a final fallback if streaming config is missing or fails before any tokens arrive.

**Tech Stack:** Express, Node 18 native `fetch`, React 18, TypeScript, existing app store message actions.

## Global Constraints

- Do not add new dependencies; use Node 18 `fetch` and Web Streams.
- All configured models are OpenAI-compatible according to the user.
- Preserve native MiMo `prompt_async + /global/event` behavior for runtime-supported models.
- Preserve current `/local-run` endpoint as final fallback.
- Show provider errors in the chat; do not silently leave the UI busy.
- Run verification from the repo root with `npm run typecheck` and `npm run build`.

---

### Task 1: Backend OpenAI-compatible Stream Endpoint

**Covers:** Three-layer routing backend stream layer.

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/index.ts`
- Create: `server/src/openaiStream.ts`

**Interfaces:**
- Produces: `resolveOpenAICompatibleModel(model: string): { providerID: string; modelID: string; baseUrl: string; apiKey?: string }`
- Produces: `streamOpenAICompatible(input, handlers): Promise<void>`
- Produces endpoint: `POST /local-run/stream` with request `{ model: string; prompt: string }` and SSE events `{ type: "start" | "delta" | "error" | "done" }`

- [ ] **Step 1: Add model config resolver**

Modify `server/src/config.ts` after `listManualModels()`:

```ts
export function resolveOpenAICompatibleModel(model: string) {
  const [providerID, modelID] = model.split("/", 2)
  if (!providerID || !modelID) throw new Error("model must be provider/model")

  const config = readMimoConfig()
  const provider = config.provider?.[providerID]
  const modelConfig = provider?.models?.[modelID]
  const baseUrl = provider?.api
  const apiKey = typeof provider?.options?.apiKey === "string" ? provider.options.apiKey : undefined

  if (!provider || !modelConfig || !baseUrl) {
    throw new Error(`OpenAI-compatible stream config not found for ${model}`)
  }

  return { providerID, modelID, baseUrl, apiKey }
}
```

- [ ] **Step 2: Add OpenAI stream helper**

Create `server/src/openaiStream.ts`:

```ts
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
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: { message?: string } | string }).error
    if (typeof error === "string") return error
    if (error?.message) return error.message
  }
  return undefined
}

export async function streamOpenAICompatible(input: OpenAIStreamInput, handlers: OpenAIStreamHandlers) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (input.model.apiKey) headers.Authorization = `Bearer ${input.model.apiKey}`

  const response = await fetch(chatCompletionsUrl(input.model.baseUrl), {
    method: "POST",
    headers,
    signal: input.signal,
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
```

- [ ] **Step 3: Add `/local-run/stream` route**

Modify imports in `server/src/index.ts`:

```ts
import { addMimoModelConfig, getProjectRoot, listManualModels, readMimoConfig, resolveOpenAICompatibleModel } from "./config.js"
import { streamOpenAICompatible } from "./openaiStream.js"
```

Add route immediately after `/local-run`:

```ts
  app.post("/local-run/stream", async (req, res) => {
    const { model, prompt } = req.body as { model?: string; prompt?: string }
    if (!model || !prompt) {
      res.status(400).json({ error: "model and prompt are required" })
      return
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    })

    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`)
    const abort = new AbortController()
    req.on("close", () => abort.abort())

    try {
      const config = resolveOpenAICompatibleModel(model)
      await streamOpenAICompatible(
        { model: config, prompt, signal: abort.signal },
        {
          onStart: () => send({ type: "start" }),
          onDelta: (text) => send({ type: "delta", text }),
          onError: (message) => send({ type: "error", error: message }),
          onDone: () => send({ type: "done" }),
        },
      )
    } catch (error) {
      if (!abort.signal.aborted) send({ type: "error", error: error instanceof Error ? error.message : String(error) })
    } finally {
      res.end()
    }
  })
```

- [ ] **Step 4: Verify server typecheck**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w server`

Expected: PASS.

---

### Task 2: Frontend Streaming Fallback Client

**Covers:** Browser consumption of OpenAI-compatible fallback SSE.

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `web/src/components/chat/ChatArea.tsx`

**Interfaces:**
- Produces: `runLocalPromptStream(input, handlers): Promise<void>`
- Consumes: backend `/local-run/stream` event types `start`, `delta`, `error`, `done`

- [ ] **Step 1: Add streaming fallback client**

Append to `web/src/api/client.ts`:

```ts
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
```

- [ ] **Step 2: Route fallback sends through stream before `/local-run`**

Modify `web/src/components/chat/ChatArea.tsx` import:

```ts
import { fetchRuntimeModels, runLocalPrompt, runLocalPromptStream } from "@/api/client"
```

Replace the current non-runtime fallback block at lines around `const result = await runLocalPrompt(...)` with:

```ts
            const assistantMessageID = createClientID("msg")
            dispatch({
              type: "ADD_MESSAGE",
              sessionID: activeSessionID,
              message: {
                id: assistantMessageID,
                sessionID: activeSessionID,
                role: "assistant",
                content: "",
                time: { created: Date.now() },
              },
            })

            try {
              await runLocalPromptStream(
                { model, prompt: promptText },
                {
                  onDelta: (delta) => {
                    dispatch({ type: "APPEND_MESSAGE_CONTENT", sessionID: activeSessionID, messageID: assistantMessageID, content: delta })
                  },
                },
              )
            } catch (streamError) {
              if ((messages[activeSessionID] || []).some((message) => message.id === assistantMessageID && message.content)) {
                throw streamError
              }
              const result = await runLocalPrompt({ model, prompt: promptText })
              dispatch({
                type: "SET_MESSAGE_CONTENT",
                sessionID: activeSessionID,
                messageID: assistantMessageID,
                content: result.text || "（模型没有返回文本）",
              })
            }

            dispatch({
              type: "SET_AGENT_STATUS",
              sessionID: activeSessionID,
              status: { sessionID: activeSessionID, state: "idle" },
            })
            return
```

Important: during implementation, avoid using stale `messages` inside this catch to decide whether any delta arrived. Prefer a local `let receivedDelta = false` variable set in `onDelta`.

- [ ] **Step 3: Verify web typecheck**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web`

Expected: PASS.

---

### Task 3: End-to-End Verification

**Covers:** Three-layer behavior and fallback safety.

**Files:**
- Modify source only if verification finds an implementation bug.

**Interfaces:**
- Consumes: `/api/session/:id/prompt_async`, `/local-run/stream`, `/local-run`

- [ ] **Step 1: Full build**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck && PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build`

Expected: both packages pass.

- [ ] **Step 2: Backend stream smoke**

Run a curl or Python request to `/local-run/stream` using a configured OpenAI-compatible model such as `libwrt/gpt-5.5`.

Expected: SSE events include `start`, at least one `delta`, and `done`; provider errors appear as `error` events.

- [ ] **Step 3: LAN browser smoke**

Open `http://192.168.10.236:8090/`, select an OpenAI-compatible non-native model, send a short prompt, and observe text appearing before request completion.

Expected: no silent 404; if native fails, streaming fallback displays deltas or a visible error message.

- [ ] **Step 4: Confirm native path unaffected**

Select `mimo/mimo-auto` or another runtime-supported native model and send `请只回复 OK`.

Expected: request still goes through `/api/session/:id/prompt_async` and replies through `/api/global/event`.
