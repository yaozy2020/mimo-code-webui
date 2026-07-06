# Native Non-Default Model Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make non-default WebUI models use the native `mimo serve` streaming/session flow when supported, while keeping the current working `/local-run` fallback as a safe backup.

**Architecture:** First add a deterministic probe that proves whether `mimo serve` can execute a selected provider/model through `/session/:id/prompt_async` and `/global/event`. Then route non-default sends through native streaming only when the probe confirms it, otherwise continue the existing fallback. This avoids removing the only currently verified working path.

**Tech Stack:** Express + TypeScript backend, React + TypeScript frontend, MiMo CLI `mimo serve`/`mimo run`, Playwright/curl-style verification via Python snippets.

## Global Constraints

- Stable user URL is `http://192.168.10.236:8090/`; browser/LAN verification is required before claiming fixed.
- `mimo/mimo-auto` must keep using the existing `/api/session/:id/prompt_async` route.
- Current `/local-run` fallback must remain available until native non-default streaming is verified from LAN.
- Do not JSON-parse `/api` proxy requests before forwarding to `mimo serve`.
- Repo has no test/lint scripts; use `npm run typecheck -w server`, `npm run typecheck -w web`, `npm run build -w server`, and `npm run build -w web` as gates.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for npm commands in this environment.

---

## File Structure

- Modify `server/src/mimo.ts`: add a native-model probe helper that creates a temporary session, posts a selected model to `mimo serve`, polls messages/events, and reports whether the assistant response is attributable and non-empty.
- Modify `server/src/index.ts`: expose a narrow diagnostic endpoint such as `POST /local-config/native-model-probe` for the WebUI/backend to query native support without touching `/api` proxy behavior.
- Modify `web/src/api/client.ts`: add a client helper for the native-model probe and keep `runLocalPrompt()` intact.
- Modify `web/src/components/chat/ChatArea.tsx`: choose native streaming only for default model or probe-confirmed models; otherwise keep `/local-run` fallback.
- No new broad UI components. Any status copy should be short and Chinese if user-visible.

### Task 1: Backend Native Model Probe

**Covers:** native capability discovery, safe fallback preservation

**Files:**
- Modify: `server/src/mimo.ts:86-145`
- Modify: `server/src/index.ts:114-140`

**Interfaces:**
- Consumes: existing `checkHealth(url)` and `detectMimo()` helpers.
- Produces: `probeNativeModel(input: { baseUrl: string; model: string; prompt?: string }): Promise<{ supported: boolean; text?: string; reason?: string }>`.

- [ ] **Step 1: Write a failing backend probe check**

Because the repo has no test runner, create a temporary manual RED script in `/tmp/native-probe-red.mjs` that imports built server code after build and calls the planned helper. Before implementation, this should fail with `probeNativeModel is not exported`.

```bash
cat >/tmp/native-probe-red.mjs <<'EOF'
import { probeNativeModel } from './server/dist/mimo.js'

const result = await probeNativeModel({
  baseUrl: 'http://127.0.0.1:4096',
  model: 'stepfun/step-3.7-flash',
  prompt: 'native probe red 请只回复 OK',
})

if (typeof result.supported !== 'boolean') {
  throw new Error('probe result must include supported boolean')
}
console.log(JSON.stringify(result))
EOF
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w server
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node /tmp/native-probe-red.mjs
```

Expected before implementation: import/export failure.

- [ ] **Step 2: Implement minimal probe helper**

Add to `server/src/mimo.ts`:

```ts
export async function probeNativeModel(input: { baseUrl: string; model: string; prompt?: string }): Promise<{ supported: boolean; text?: string; reason?: string }> {
  const [providerID, modelID] = input.model.split("/", 2)
  if (!providerID || !modelID) return { supported: false, reason: "invalid model id" }

  const prompt = input.prompt ?? "native model probe，请只回复 OK"
  const sessionResponse = await fetch(`${input.baseUrl}/session`, { method: "POST" })
  if (!sessionResponse.ok) return { supported: false, reason: `session create failed: ${sessionResponse.status}` }
  const session = (await sessionResponse.json()) as { id?: string }
  if (!session.id) return { supported: false, reason: "session create returned no id" }

  const promptResponse = await fetch(`${input.baseUrl}/session/${session.id}/prompt_async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionID: session.id,
      agent: "build",
      model: { providerID, modelID },
      parts: [{ type: "text", text: prompt }],
    }),
  })
  if (!promptResponse.ok) return { supported: false, reason: `prompt failed: ${promptResponse.status}` }

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await sleep(1000)
    const messagesResponse = await fetch(`${input.baseUrl}/session/${session.id}/message?limit=20`)
    if (!messagesResponse.ok) continue
    const messages = (await messagesResponse.json()) as Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
    const assistant = messages.find((message) => message.info?.role === "assistant" && message.parts?.some((part) => part.type === "text" && part.text))
    const text = assistant?.parts?.filter((part) => part.type === "text" && part.text).map((part) => part.text).join("\n")
    if (text) return { supported: true, text }
  }

  return { supported: false, reason: "no assistant text from native prompt_async" }
}
```

- [ ] **Step 3: Expose diagnostic endpoint**

Add to `server/src/index.ts` near other `/local-config` routes:

```ts
app.post("/local-config/native-model-probe", async (req, res) => {
  try {
    const { model } = req.body as { model?: string }
    if (!model) {
      res.status(400).json({ error: "model is required" })
      return
    }
    res.json(await probeNativeModel({ baseUrl: mimoInfo.url, model }))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})
```

Update imports in `server/src/index.ts` to include `probeNativeModel`.

- [ ] **Step 4: Verify backend probe**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w server
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w server
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node /tmp/native-probe-red.mjs
```

Expected: script prints JSON with `supported` boolean. If `supported:false`, do not force native route; use reason to guide Task 2.

### Task 2: Frontend Native-or-Fallback Routing

**Covers:** native streaming when proven, fallback when native unsupported

**Files:**
- Modify: `web/src/api/client.ts:258-272`
- Modify: `web/src/components/chat/ChatArea.tsx:101-124`

**Interfaces:**
- Consumes: `POST /local-config/native-model-probe` from Task 1.
- Produces: `probeNativeModel(model: string): Promise<{ supported: boolean; text?: string; reason?: string }>`.

- [ ] **Step 1: Add frontend helper**

Add to `web/src/api/client.ts`:

```ts
export async function probeNativeModel(model: string): Promise<{ supported: boolean; text?: string; reason?: string }> {
  const response = await fetch("/local-config/native-model-probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ model }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    return { supported: false, reason: data.error || `HTTP ${response.status}` }
  }
  return response.json() as Promise<{ supported: boolean; text?: string; reason?: string }>
}
```

- [ ] **Step 2: Route by probe result**

In `ChatArea.tsx`, for non-default models:

```ts
const modelKey = `${selectedModel.providerID}/${selectedModel.modelID}`
const native = await probeNativeModel(modelKey)
if (!native.supported) {
  const result = await runLocalPrompt({ model: modelKey, prompt: promptText })
  const assistantMessage: Message = {
    id: createClientID("msg"),
    sessionID: activeSessionID,
    role: "assistant",
    content: result.text || "（模型没有返回文本）",
    time: { created: Date.now() },
  }
  dispatch({ type: "ADD_MESSAGE", sessionID: activeSessionID, message: assistantMessage })
  return
}
```

If `native.supported` is true, fall through to existing `sendPrompt()` so `/global/event` drives streaming.

- [ ] **Step 3: Verify frontend**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
```

Expected: both pass.

### Task 3: LAN Acceptance Verification

**Covers:** user-visible correctness on stable URL

**Files:**
- No source edits unless verification exposes a Task 1/2 bug.

**Interfaces:**
- Consumes: rebuilt server and web assets.
- Produces: evidence that `8090` behavior matches supported native/fallback status.

- [ ] **Step 1: Restart 8090**

Run:

```bash
pid=$(ss -ltnp 'sport = :8090' 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n1)
if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
sleep 1
HOST=0.0.0.0 PORT=8090 PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm start -w server > /tmp/mimo-code-webui-8090.log 2>&1 &
sleep 3
curl -sS http://127.0.0.1:8090/status
```

Expected: status JSON reports `mimo.healthy:true`.

- [ ] **Step 2: Verify browser request path**

Use Playwright on `http://192.168.10.236:8090/`:

```python
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    local_runs = []
    prompt_posts = []
    probes = []
    page.on('request', lambda req: local_runs.append(req.post_data) if req.method == 'POST' and '/local-run' in req.url else None)
    page.on('request', lambda req: prompt_posts.append(req.post_data) if req.method == 'POST' and 'prompt_async' in req.url else None)
    page.on('request', lambda req: probes.append(req.post_data) if req.method == 'POST' and '/local-config/native-model-probe' in req.url else None)
    page.goto('http://192.168.10.236:8090/', wait_until='domcontentloaded')
    page.wait_for_timeout(2500)
    page.locator('select[aria-label="切换模型"]').select_option('stepfun/step-3.7-flash')
    probe = 'native-streaming-acceptance 请只回复 OK'
    page.locator('textarea').first.fill(probe)
    page.keyboard.press('Enter')
    page.wait_for_timeout(20000)
    body = page.locator('body').inner_text()
    print(json.dumps({
        'has_ok': 'OK' in body,
        'probe_count': len(probes),
        'prompt_count': len(prompt_posts),
        'local_run_count': len(local_runs),
        'tail': body[-800:],
    }, ensure_ascii=False, indent=2))
    browser.close()
```

Expected:
- Always: `probe_count >= 1` and `has_ok:true`.
- If native probe says supported: `prompt_count >= 1` and `local_run_count == 0`.
- If native probe says unsupported: `local_run_count >= 1`; report the backend `reason` and keep fallback.

## Self-Review

- Spec coverage: all requested behavior is covered by Tasks 1-3.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: backend and frontend both use `{ supported: boolean; text?: string; reason?: string }`.
