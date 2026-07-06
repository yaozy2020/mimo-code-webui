# Runtime Entrypoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and minimally fix Abort, Web search, and Todo through the real MiMo serve and LAN WebUI path.

**Architecture:** Keep current React UI and Express proxy. First test existing entrypoints through `http://192.168.10.236:8090/`; only patch protocol mismatches found by official source comparison or runtime evidence.

**Tech Stack:** React 18, TypeScript, Vite, Express proxy, MiMo serve HTTP/SSE API.

## Global Constraints

- Verification must use `http://192.168.10.236:8090/` and real `mimo serve`, not mocked state.
- Available verification commands are `npm run typecheck -w web` and `npm run build -w web`.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm.
- Fix only proven gaps; no broad official app rewrite.

---

### Task 1: Todo Protocol Alignment

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/hooks/useStreamingMessage.ts`
- Modify: `web/src/api/session.ts`
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/components/chat/PromptToolbar.tsx`

**Interfaces:**
- Consumes official `todo.updated` as `{ sessionID, todos: [{ content, status }] }`.
- Produces active-session todo bootstrap via `GET /session/:id/todo`.

- [ ] Align `TodoItem` to optional `id`, `content`, `status`, and compatibility `completed`.
- [ ] Parse `todo.updated.properties.todos` with fallback to old `items`.
- [ ] Load active session todos on session change.
- [ ] Render completed count from `status === "completed" || completed`.

### Task 2: Real Entrypoint Verification

**Files:**
- No source edits unless verification reveals a concrete protocol mismatch.

**Interfaces:**
- Proves Abort sends `/session/:id/abort` and returns the session to non-busy state.
- Proves Web search mode sends a real prompt and either returns a real answer or a surfaced provider/plugin error.
- Proves Todo updates render from either SSE or `GET /session/:id/todo`.

- [ ] Build and restart 8090.
- [ ] Use Playwright LAN browser to test Abort with a deliberately long real prompt.
- [ ] Use Playwright LAN browser to test Web search mode with a prompt requiring current information.
- [ ] Trigger a real todo update prompt and verify the toolbar shows `任务 X/Y` from official todo data.
- [ ] Run final typecheck and build.
