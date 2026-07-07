# WebUI Improvement Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the currently working MiMo Code WebUI into a stable daily-use workbench by prioritizing core chat reliability, then input capabilities, then workspace management polish.

**Architecture:** Keep the existing React/Vite frontend and Express `/api/* -> mimo serve` proxy architecture. Improve behavior at the protocol edges already used by the app: one shared app SSE reader, official `prompt_async` sessions, WebUI-owned session state, and browser-local settings. Avoid feature work that requires unsupported MiMo serve protocol changes.

**Tech Stack:** React 18, TypeScript strict mode, Vite, Tailwind/shadcn local components, Express server, MiMo Code `mimo serve` HTTP/SSE API, Python Playwright for LAN verification.

## Global Constraints

- Validate user-visible WebUI behavior through the real LAN entrypoint `http://192.168.10.236:8090/` with browser/DOM evidence before claiming completion.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm commands in this environment.
- Do not use repo-defined test/lint commands that do not exist. Use `npm run typecheck -w web`, `npm run typecheck -w server`, and `npm run build` / package builds.
- Do not open ad-hoc second `/global/event` readers inside `ChatArea`; coordinate visible streaming and recovery through `useStreamingMessage`.
- Avoid `pkill -f "node server/dist/index.js"` from this agent harness. If a restart is required, kill by explicit PID and relaunch with `setsid env PORT=8090 PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node server/dist/index.js > /tmp/webui_8090.log 2>&1 < /dev/null & disown`.
- Keep changes minimal. Do not add large abstractions, broad rewrites, or placeholder UI for unsupported protocol behavior.

---

## File Structure

- `web/src/hooks/useStreamingMessage.ts`: Owns the single app-level SSE connection, event dispatch, reconnect behavior, and post-idle synchronization.
- `web/src/stores/appStore.tsx`: Owns session/message/todo/diff/context state, optimistic-message reconciliation, visible/owned/attached session tracking, and settings persistence.
- `web/src/components/chat/ChatArea.tsx`: Owns active-session loading, prompt send path, input composition, and active chat rendering.
- `web/src/components/chat/InputBar.tsx`: Owns text entry, mode selection, attachments selected by the user, and send payload assembly.
- `web/src/components/multimodal/MultimodalPanel.tsx`: Existing multimodal UI surface; should either be wired into `InputBar` or removed from the main flow until supported.
- `web/src/components/search/WebSearchPanel.tsx`: Existing search UI surface; should be audited and either mounted into a real `agent:"explore"` flow or removed from priority scope.
- `web/src/components/chat/MessageBubble.tsx`: Owns rendering of assistant text, thinking, tool calls, file parts, and visible errors.
- `web/src/components/layout/Sidebar.tsx`: Owns session list actions and should host rename/fork/delete/attach labels if added.
- `web/src/api/session.ts`: Session, message, todo, diff, delete, update, fork API wrappers and raw message mapping.
- `web/src/api/message.ts`: Prompt, permission, question, abort API wrappers.
- `server/src/index.ts`: Express entrypoint; only touch for backend routes needed by input capability verification or static serving/startup behavior.
- `server/src/proxy.ts`: `/api` proxy; do not parse `/api` request bodies before proxying.

---

### Task 1: Core Chat Stability Audit And Fixes

**Covers:** S1 core reliability, S2 refresh consistency, S3 SSE recovery, S4 session ownership clarity

**Files:**
- Modify: `web/src/hooks/useStreamingMessage.ts`
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/components/chat/PromptToolbar.tsx`
- Modify: `web/src/components/chat/sessionSource.ts`
- Test/verify: new or updated one-off Playwright scripts under `/tmp/webui-core-*.py` during execution, or a repo script only if the project later adopts test infrastructure

**Interfaces:**
- Consumes: existing MiMo SSE event types `message.updated`, `message.part.delta`, `message.part.updated`, `session.idle`, `session.error`, `todo.updated`, `session.diff`.
- Produces: stable active-session messages after reload, visible external-session labeling, no periodic message snapshot clobbering during streaming, and recovery after SSE interruption.

- [ ] **Step 1: Write a failing refresh-consistency probe**

Create `/tmp/webui-refresh-consistency.py` that:

```python
import json, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://192.168.10.236:8090"
DIR = "/vol2/1000/下载/mimo/mimo-code-webui"

def api(path, payload=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload else None,
        headers={"Content-Type": "application/json"},
        method="POST" if payload else "GET",
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return response.status, response.read().decode()

status, body = api("/api/session?directory=" + urllib.parse.quote(DIR), {"title": "core-refresh-probe"})
session_id = json.loads(body)["id"]
status, _ = api(
    f"/api/session/{session_id}/prompt_async?directory=" + urllib.parse.quote(DIR),
    {
        "sessionID": session_id,
        "agent": "build",
        "model": {"providerID": "mimo", "modelID": "mimo-auto"},
        "parts": [{"type": "text", "text": "只回复 OK"}],
    },
)
assert status == 204

for _ in range(30):
    time.sleep(1)
    _, body = api(f"/api/session/{session_id}/message?limit=20&directory=" + urllib.parse.quote(DIR))
    messages = json.loads(body)
    assistant = [item for item in messages if item["info"]["role"] == "assistant"]
    if assistant and assistant[0]["parts"]:
        break
else:
    raise AssertionError("assistant message did not finish")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page = browser.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    page.evaluate(
        """([directory, sessionID]) => {
          localStorage.setItem('mimo-webui-current-workspace', directory)
          localStorage.setItem('mimo-webui-active-session', sessionID)
          const owned = JSON.parse(localStorage.getItem('mimo-webui-owned-session-ids') || '[]')
          if (!owned.includes(sessionID)) owned.push(sessionID)
          localStorage.setItem('mimo-webui-owned-session-ids', JSON.stringify(owned))
        }""",
        [DIR, session_id],
    )
    page.reload(wait_until="domcontentloaded")
    time.sleep(5)
    text = page.inner_text("body")
    assert "OK" in text, text
    assert "上下文" in text, text
    browser.close()
```

- [ ] **Step 2: Run the probe and capture the failure**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" python3 /tmp/webui-refresh-consistency.py
```

Expected before fixes: fail if refreshed UI loses message content, context badge, or active session.

- [ ] **Step 3: Audit and fix only verified core drift**

Inspect these exact locations before editing:

```text
web/src/hooks/useStreamingMessage.ts: createEventStream call, session.idle handling, session.error handling
web/src/components/chat/ChatArea.tsx: initial getMessages/getTodos effects and refresh effect
web/src/stores/appStore.tsx: SET_MESSAGES, ADD_MESSAGE, SET_MODEL_LIMITS, optimistic merge logic
web/src/components/chat/sessionSource.ts: owned vs attached labeling
```

Make only changes tied to probe evidence. Acceptable fixes include:

```ts
// If model limits or other late metadata changes a derived toolbar value,
// recompute from already-loaded messages inside the reducer that receives metadata.
case "SET_MODEL_LIMITS": {
  const nextContextUsage = { ...state.contextUsage }
  for (const [sessionID, sessionMessages] of Object.entries(state.messages)) {
    const usage = contextUsageFromMessages(sessionMessages, action.limits)
    if (usage) nextContextUsage[sessionID] = usage
  }
  return { ...state, modelLimits: action.limits, contextUsage: nextContextUsage }
}
```

Do not add a second SSE stream in `ChatArea`.

- [ ] **Step 4: Verify core chat stability**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" python3 /tmp/webui-refresh-consistency.py
```

Expected: typecheck passes, build passes, Playwright probe passes.

- [ ] **Step 5: Manual LAN smoke**

Open `http://192.168.10.236:8090/` and verify:

```text
1. Refresh keeps the same active WebUI-owned session.
2. Reply text remains visible after refresh.
3. Context badge is compact, e.g. 上下文 23.5K.
4. Attached external/CLI sessions are visibly distinguishable from owned sessions.
```

---

### Task 2: Input Capability Reality Pass

**Covers:** S5 file input, S6 multimodal truthfulness, S7 web search routing

**Files:**
- Modify: `web/src/components/chat/InputBar.tsx`
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/components/chat/MessageBubble.tsx`
- Modify: `web/src/components/multimodal/MultimodalPanel.tsx`
- Modify: `web/src/components/search/WebSearchPanel.tsx`
- Modify: `web/src/api/message.ts`
- Test/verify: `/tmp/webui-input-capabilities.py`

**Interfaces:**
- Consumes: `sendPrompt(sessionID, { agent, model, parts, directory })`, `PromptPart` with `type: "text" | "file" | "image" | "audio" | "video"`.
- Produces: honest input UI where every visible capability either sends a real supported prompt part or is clearly disabled/hidden.

- [ ] **Step 1: Write a capability inventory probe**

Create `/tmp/webui-input-capabilities.py`:

```python
import time
from playwright.sync_api import sync_playwright

BASE = "http://192.168.10.236:8090"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page = browser.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    time.sleep(3)
    body = page.inner_text("body")
    print(body)
    assert "构建" in body
    assert "规划" in body
    assert "编排" in body
    browser.close()
```

This probe is intentionally broad first; expand it after reading current UI behavior.

- [ ] **Step 2: Audit visible input controls against real send payloads**

Read:

```text
web/src/components/chat/InputBar.tsx
web/src/components/chat/ChatArea.tsx:122-163
web/src/components/multimodal/MultimodalPanel.tsx
web/src/components/search/WebSearchPanel.tsx
web/src/api/message.ts:5-54
```

Classify each visible control as:

```text
SUPPORTED: control creates a PromptPart and sendPrompt sends it to prompt_async.
PARTIAL: control creates local UI state but not a real prompt part.
UNWIRED: control is not mounted or cannot affect sendPrompt.
```

- [ ] **Step 3: Fix file input first if it is partial**

If files can be selected but are not sent as usable prompt parts, wire the smallest path:

```ts
const promptParts = [
  ...(promptText ? [{ type: "text" as const, content: promptText }] : []),
  ...attachments.map((attachment) => ({
    id: attachment.id,
    type: attachment.type,
    content: attachment.content,
    mime: attachment.mime,
    filename: attachment.filename,
    url: attachment.url,
    size: attachment.size,
  })),
]
```

Do not introduce upload storage or server-side file persistence unless current code already has it.

- [ ] **Step 4: Hide or label unsupported multimodal controls**

If `MultimodalPanel` is unmounted or unsupported by the current MiMo API path, do not pretend it works. Use one of these minimal UI treatments:

```tsx
<Button type="button" variant="ghost" disabled title="多模态输入还未接入当前发送链路">
  多模态
</Button>
```

or remove it from the primary toolbar until a real send path exists.

- [ ] **Step 5: Make web search use real `agent:"explore"` or hide it**

If search UI is kept, route the action through the same `sendPrompt` function with:

```ts
await sendPrompt(activeSessionID, {
  agent: "explore",
  model: settings.model,
  parts: [{ type: "text", content: searchQuery }],
  directory: activeDirectory,
})
```

If that cannot be verified on LAN in this task, hide the panel from primary navigation.

- [ ] **Step 6: Verify input capability truthfulness**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" python3 /tmp/webui-input-capabilities.py
```

Manual LAN checks:

```text
1. Select a small text file and send "总结附件"; assistant should reference the file content.
2. If multimodal is visible, it must either send a real part or be clearly disabled.
3. If search is visible, it must produce explore-agent behavior or be hidden.
```

---

### Task 3: Session Management Polish

**Covers:** S8 rename, S9 fork, S10 delete/detach clarity, S11 git status clarity

**Files:**
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/hooks/useSessions.ts`
- Modify: `web/src/api/session.ts`
- Modify: `web/src/components/chat/PromptToolbar.tsx`
- Modify: `web/src/components/files/FileChangesPanel.tsx`
- Test/verify: `/tmp/webui-session-management.py`

**Interfaces:**
- Consumes: existing `updateSession(sessionID, updates, directory)`, `forkSession(sessionID, messageID, directory)`, `deleteSession(sessionID, directory)` wrappers.
- Produces: visible session rename, fork, delete/detach affordances that do not confuse WebUI-owned sessions with attached external sessions.

- [ ] **Step 1: Write a failing session-management browser probe**

Create `/tmp/webui-session-management.py`:

```python
import time
from playwright.sync_api import sync_playwright

BASE = "http://192.168.10.236:8090"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page = browser.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    time.sleep(3)
    body = page.inner_text("body")
    assert "会话" in body
    print(body[:1200])
    browser.close()
```

Expand the probe after choosing exact UI labels.

- [ ] **Step 2: Add rename affordance to session items**

In `Sidebar.tsx`, add a small action for the active or hovered session with label `重命名`. Wire it to `useSessions().rename(session.id, nextTitle)`.

Minimal implementation shape:

```tsx
const nextTitle = window.prompt("重命名会话", session.title ?? "")
if (nextTitle?.trim()) void rename(session.id, nextTitle.trim())
```

Do not add a custom dialog until the prompt-based flow is verified.

- [ ] **Step 3: Add fork affordance from latest user message**

Use `fork(session.id, messageID)` only when a latest user message ID exists. If no message exists, do not show fork.

Helper shape:

```ts
function latestUserMessageID(messages: Message[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.id
}
```

- [ ] **Step 4: Clarify delete vs detach**

For owned sessions, label destructive action `删除`. For attached external sessions, label it `移除接入` and call `remove(session.id, { deleteRemote: false })`.

UI copy:

```text
删除：删除 WebUI 创建的远端会话
移除接入：只从 WebUI 列表移除，不删除外部会话
```

- [ ] **Step 5: Keep git status scoped to verified data**

If `gitStatus` has no reliable data source, do not show a misleading global badge. Prefer existing `sessionDiffs[sessionID]` and `FileChangesPanel` counts because they are tied to `session.diff`.

- [ ] **Step 6: Verify session management**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" python3 /tmp/webui-session-management.py
```

Manual LAN checks:

```text
1. Rename a WebUI-owned session and refresh; title persists.
2. Remove an attached external session; external CLI/debug session is not deleted.
3. Delete a WebUI-owned session; it disappears after refresh.
4. Fork appears only when a valid latest user message exists.
```

---

## Execution Order

1. **Task 1 first.** It protects the primary chat loop and prevents false negatives in later feature tests.
2. **Task 2 second.** It decides which input features are real and removes misleading UI before adding polish.
3. **Task 3 last.** Management actions are useful, but they should not outrank chat and input correctness.

## Success Criteria

- The LAN WebUI can be refreshed during and after a model response without losing visible reply, active session, compact context badge, or session state.
- GPT and LongCat remain native-streaming on fresh WebUI-owned sessions.
- Any visible input feature either works through the real prompt path or is disabled/hidden with honest copy.
- Session list actions are clear for owned vs attached sessions.
- Verification commands pass and at least one Playwright LAN probe backs each completed task.
