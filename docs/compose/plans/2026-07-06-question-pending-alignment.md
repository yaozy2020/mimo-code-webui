# Question Pending Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the WebUI question flow with the official MiMo Code API and verify it through the real LAN browser path.

**Architecture:** Keep the current React/Vite WebUI and Express proxy. Match official `mimo serve` question endpoints and SSE events with minimal store/API/dialog changes, then prove the flow with a real `question` tool request.

**Tech Stack:** React 18, TypeScript, Vite, Express proxy, MiMo serve HTTP/SSE API.

## Global Constraints

- Verify through `http://192.168.10.236:8090/`, not curl-only or mocked UI state.
- Do not invent repo test/lint scripts; use `npm run typecheck -w web` and `npm run build -w web`.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for npm commands.
- Keep the change minimal: align official question protocol and pending state only.
- Do not consume real pending permissions/questions unless that is the explicit verification target.

---

### Task 1: Align Question Types And API

**Covers:** Question request/reply/reject official protocol.

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/message.ts`

**Interfaces:**
- Produces: `listQuestions(): Promise<QuestionRequest[]>`
- Produces: `respondQuestion(requestID: string, answers: string[][]): Promise<void>`
- Produces: `rejectQuestion(requestID: string): Promise<void>`

- [ ] **Step 1: Update `QuestionRequest` to official shape**

Use official fields: `questions: QuestionInfo[]`, where each question has `header`, `question`, `options`, `multiple`, and `custom`.

- [ ] **Step 2: Add official question API wrappers**

`GET /question`, `POST /question/:id/reply` with `{ answers }`, and `POST /question/:id/reject`.

- [ ] **Step 3: Typecheck**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web`
Expected: pass or reveal the UI call sites to update in Task 2.

### Task 2: Update Question Dialog And SSE Closure

**Covers:** Real pending question display and close-on-reply/reject behavior.

**Files:**
- Modify: `web/src/components/chat/QuestionDialog.tsx`
- Modify: `web/src/hooks/useStreamingMessage.ts`
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: Task 1 question API wrappers.
- Produces: current pending question loads on startup, displays official multi-question prompts, replies with `string[][]`, rejects via endpoint, and closes on `question.replied` / `question.rejected`.

- [ ] **Step 1: Add store action to clear a specific question**

Add `CLEAR_PENDING_QUESTION` that clears only when `pendingQuestion.id === requestID`.

- [ ] **Step 2: Handle SSE reply/reject events**

In `useStreamingMessage`, handle `question.replied` and `question.rejected` by dispatching `CLEAR_PENDING_QUESTION`.

- [ ] **Step 3: Bootstrap pending questions**

In `App.tsx`, call `listQuestions()` on startup/active-session change, preferring the active session's question if present.

- [ ] **Step 4: Rewrite `QuestionDialog` rendering**

Render all `pendingQuestion.questions`, support single/multiple option selection and custom text when allowed, submit answers as `string[][]`, reject on dialog close, and show loading/error.

- [ ] **Step 5: Typecheck**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web`
Expected: pass.

### Task 3: Real-Chain Verification

**Covers:** User requirement: no more fake success; verify through real chain.

**Files:**
- No source files expected beyond Tasks 1-2.

**Interfaces:**
- Consumes: 8090 production build and running `mimo serve`.
- Produces: verified evidence that a real question prompt appears, submits through `/api/question/:id/reply`, receives HTTP 200, and clears pending state.

- [ ] **Step 1: Build and restart 8090**

Run web build and restart the server serving port 8090.

- [ ] **Step 2: Trigger a real question**

Send a WebUI prompt that asks MiMo to use the question tool with one clear option question, then wait for the real `question.asked` event/dialog.

- [ ] **Step 3: Answer through the LAN UI**

Click an option and submit. Capture that the browser sends `POST /api/question/:id/reply` with `{ answers: [...] }` and gets HTTP 200.

- [ ] **Step 4: Confirm closure and continuation**

Verify `GET http://127.0.0.1:4096/question` no longer contains that request and the UI dialog closes without manual refresh.

- [ ] **Step 5: Final verification gates**

Run `npm run typecheck -w web` and `npm run build -w web` with the PATH prefix.
