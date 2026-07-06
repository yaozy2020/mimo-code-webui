# Workspace Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace-aware new sessions and explicit safe attachment of existing MiMo sessions.

**Architecture:** Treat session `directory` as first-class frontend state and pass it to official MiMo routes as a query parameter. Keep the default sidebar filtered to WebUI-owned or explicitly attached sessions, with discovery hidden behind an attach dialog.

**Tech Stack:** React 18, TypeScript, Vite, local shadcn-style UI components, existing Express `/api` proxy to MiMo serve.

## Global Constraints

- User-facing copy remains Chinese.
- Official MiMo workspace context is `?directory=<path>` or `x-mimocode-directory`, not JSON body `{ directory }`.
- Default UI must not auto-attach or auto-display unrelated CLI sessions.
- Verification must use `http://192.168.10.236:8090/` plus TypeScript/build gates.
- No new backend storage or separate MiMo serve instances in this slice.

---

## File Structure

- Modify `web/src/api/session.ts`: add directory query helpers and attach/discovery API wrappers.
- Modify `web/src/stores/appStore.tsx`: persist current workspace, attached session IDs, and avoid treating every active session as owned by default.
- Modify `web/src/hooks/useSessions.ts`: split visible owned sessions from discoverable sessions.
- Modify `web/src/hooks/useNewChat.ts`: create sessions with a workspace path.
- Create `web/src/components/chat/WorkspaceSessionDialog.tsx`: new-session workspace dialog.
- Create `web/src/components/chat/AttachSessionDialog.tsx`: explicit existing-session attach dialog.
- Modify `web/src/components/layout/Sidebar.tsx`: add workspace/new/attach controls and owned-session filtering.
- Modify `web/src/components/layout/Header.tsx`: route new-session action through workspace dialog.
- Modify `web/src/components/chat/ChatArea.tsx`: remove first-load no-directory auto-create and pass active session directory to message/todo/diff/prompt calls.

### Task 1: Correct Session API Directory Context

**Covers:** [S2], [S5], [S6]

**Files:**
- Modify: `web/src/api/session.ts`
- Modify: `web/src/api/message.ts`

**Interfaces:**
- Produces: `withDirectory(path: string, directory?: string): string`
- Produces: `listSessions(directory?: string): Promise<Session[]>`
- Produces: `createSession(input?: { directory?: string; title?: string }): Promise<Session>`
- Produces: `getSession(sessionID: string, directory?: string): Promise<Session>`
- Produces: `getMessages(sessionID: string, directory?: string): Promise<Message[]>`
- Produces: `getTodos(sessionID: string, directory?: string): Promise<Todo[]>`
- Produces: `getSessionDiff(sessionID: string, messageID: string, directory?: string): Promise<SessionDiffFile[]>`
- Consumes: existing `apiFetch` wrapper.

- [ ] **Step 1: Write a failing check by running current LAN reproduction mentally as a source-level gate**

There are no repo test scripts. Use a source grep after implementation to ensure `createSession` no longer posts `{ directory }` in the JSON body.

Run before implementation:

```bash
grep -n "directory" web/src/api/session.ts
```

Expected before fix: `createSession` uses `JSON.stringify(directory ? { directory } : {})` or equivalent body behavior.

- [ ] **Step 2: Implement query-based directory helpers**

In `web/src/api/session.ts`, add:

```ts
function withDirectory(path: string, directory?: string) {
  if (!directory?.trim()) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}directory=${encodeURIComponent(directory.trim())}`
}
```

Change API helpers to use it:

```ts
export async function listSessions(directory?: string): Promise<Session[]> {
  const data = await apiFetch<unknown>(withDirectory("/session", directory))
  return normalizeSessions(data)
}

export async function createSession(input: { directory?: string; title?: string } = {}): Promise<Session> {
  return apiFetch<Session>(withDirectory("/session", input.directory), {
    method: "POST",
    body: JSON.stringify(input.title ? { title: input.title } : {}),
  })
}

export async function getSession(sessionID: string, directory?: string): Promise<Session> {
  return apiFetch<Session>(withDirectory(`/session/${sessionID}`, directory))
}
```

Update `getMessages`, `getTodos`, and `getSessionDiff` signatures to accept optional directory and pass it through `withDirectory`.

- [ ] **Step 3: Pass directory through prompt sends**

In `web/src/api/message.ts`, extend `SendPromptInput`:

```ts
export interface SendPromptInput {
  agent?: "build" | "plan" | "explore"
  model?: string
  parts: PromptPart[]
  variant?: string
  directory?: string
}
```

Add the same local `withDirectory` helper or import one if it is exported from `session.ts`, then change POST URL:

```ts
await apiFetch(withDirectory(`/session/${sessionID}/prompt_async`, input.directory), {
  method: "POST",
  body: JSON.stringify({ ... })
})
```

- [ ] **Step 4: Verify source gate and types**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
```

Expected: `tsc --noEmit` exits 0.

### Task 2: Store Workspace And Explicit Attachment State

**Covers:** [S3], [S5]

**Files:**
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/types/index.ts` if needed for added fields.

**Interfaces:**
- Produces state field: `currentWorkspace: string | null`
- Produces state field: `attachedSessionIDs: string[]`
- Produces actions: `SET_CURRENT_WORKSPACE`, `ATTACH_SESSION`, `DETACH_SESSION`
- Consumes existing `ownedSessionIDs` and localStorage keys.

- [ ] **Step 1: Add persisted keys**

In `appStore.tsx`, add constants:

```ts
const CURRENT_WORKSPACE_KEY = "mimo-webui-current-workspace"
const ATTACHED_SESSION_IDS_KEY = "mimo-webui-attached-session-ids"
```

Add safe readers similar to existing owned-session parsing.

- [ ] **Step 2: Extend state and actions**

Add to state:

```ts
currentWorkspace: string | null
attachedSessionIDs: string[]
```

Add action union cases:

```ts
| { type: "SET_CURRENT_WORKSPACE"; workspace: string | null }
| { type: "ATTACH_SESSION"; sessionID: string }
| { type: "DETACH_SESSION"; sessionID: string }
```

- [ ] **Step 3: Implement reducer behavior**

`SET_CURRENT_WORKSPACE` persists trimmed workspace or removes the key for null/empty.

`ATTACH_SESSION` appends unique session ID to `attachedSessionIDs` and persists it. It should not create a fake session object.

`DETACH_SESSION` removes the ID from `attachedSessionIDs` and `ownedSessionIDs`; if the detached ID is active, clear `activeSessionID`.

Change `SET_ACTIVE_SESSION` so it no longer automatically appends to `ownedSessionIDs`. Keep ownership changes in `ADD_SESSION` and `ATTACH_SESSION` only.

- [ ] **Step 4: Verify types**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
```

Expected: exit 0.

### Task 3: Workspace New Session Dialog

**Covers:** [S1], [S3], [S4], [S5]

**Files:**
- Modify: `web/src/hooks/useNewChat.ts`
- Create: `web/src/components/chat/WorkspaceSessionDialog.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `createSession({ directory, title })`
- Consumes: `currentWorkspace` and `SET_CURRENT_WORKSPACE`
- Produces component: `WorkspaceSessionDialog({ open, onOpenChange, defaultWorkspace })`

- [ ] **Step 1: Update new-chat hook**

Change `useNewChat` to accept an object:

```ts
export function useNewChat() {
  const dispatch = useAppDispatch()
  return useCallback(async (input: { directory?: string; title?: string } = {}) => {
    const session = await createSession(input)
    dispatch({ type: "ADD_SESSION", session })
    if (session.directory) dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: session.directory })
    dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
    return session
  }, [dispatch])
}
```

- [ ] **Step 2: Create workspace dialog**

Create `WorkspaceSessionDialog.tsx` with controlled `open`, `onOpenChange`, `defaultWorkspace`, and optional `onCreated` props. It renders Chinese labels:

```tsx
<DialogTitle>新建工作区会话</DialogTitle>
<Label htmlFor="workspace-path">工作区路径</Label>
<Input id="workspace-path" value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
<Label htmlFor="session-title">会话标题（可选）</Label>
<Input id="session-title" value={title} onChange={(event) => setTitle(event.target.value)} />
```

On submit, require `workspace.trim()`, call `newChat({ directory: workspace.trim(), title: title.trim() || undefined })`, close dialog, and show any error inline.

- [ ] **Step 3: Wire Sidebar/Header buttons**

In `Sidebar.tsx`, replace direct `newChat()` with opening `WorkspaceSessionDialog`. Default workspace should be active session directory, then `currentWorkspace`, then empty.

In `Header.tsx`, route the new session button the same way or call a prop supplied by the parent if Header cannot own the dialog cleanly. Prefer one dialog owned in `Sidebar` if Header already has a button location that can be changed minimally.

- [ ] **Step 4: Verify types**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
```

Expected: exit 0.

### Task 4: Explicit Attach Existing Session Dialog

**Covers:** [S3], [S4], [S5]

**Files:**
- Create: `web/src/components/chat/AttachSessionDialog.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/hooks/useSessions.ts`

**Interfaces:**
- Consumes: `getSession(sessionID, directory?)`
- Consumes: `listSessions(directory?)`
- Consumes actions: `ATTACH_SESSION`, `ADD_SESSION`, `SET_ACTIVE_SESSION`, `SET_CURRENT_WORKSPACE`
- Produces component: `AttachSessionDialog({ open, onOpenChange })`

- [ ] **Step 1: Split owned visible sessions from discovered sessions**

In `useSessions.ts`, keep loading all sessions from `listSessions()`, but expose owned visible sessions by filtering IDs in `ownedSessionIDs` or `attachedSessionIDs`.

Do not remove all-session loading entirely because attach discovery needs it.

- [ ] **Step 2: Create attach dialog**

Create a dialog with Chinese copy:

```tsx
<DialogTitle>接入已有会话</DialogTitle>
<Input placeholder="输入 ses_... 会话 ID" />
<Button>查找</Button>
<Button variant="outline">浏览现有 MiMo 会话</Button>
```

By ID flow:

```ts
const session = await getSession(sessionID.trim())
dispatch({ type: "ADD_SESSION", session })
dispatch({ type: "ATTACH_SESSION", sessionID: session.id })
if (session.directory) dispatch({ type: "SET_CURRENT_WORKSPACE", workspace: session.directory })
dispatch({ type: "SET_ACTIVE_SESSION", sessionID: session.id })
```

Browse flow uses `listSessions()` and shows title, ID, directory, and a `接入` button for each unattached session.

- [ ] **Step 3: Wire sidebar attach button**

Add a small `接入已有` button near the new session button. It opens `AttachSessionDialog`. Default sidebar list remains filtered to owned/attached sessions only.

- [ ] **Step 4: Verify types**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
```

Expected: exit 0.

### Task 5: Workspace-Aware Chat Runtime

**Covers:** [S2], [S4], [S5], [S6]

**Files:**
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/hooks/useSessions.ts` if active-session lookup helpers are needed.

**Interfaces:**
- Consumes active session `directory` from `messages/sessions` state.
- Consumes API helpers accepting optional directory.

- [ ] **Step 1: Remove no-directory first-load auto-create**

In `ChatArea.tsx`, when there is no active session, render an empty state with buttons for `新建工作区会话` and `接入已有会话` instead of calling `createSession()` immediately.

- [ ] **Step 2: Resolve active session directory**

Add local helper:

```ts
const activeSession = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
const activeDirectory = activeSession?.directory ?? settings.lastWorkspaceOrEquivalent
```

Use the actual store/session field names after reading current state.

- [ ] **Step 3: Pass directory to data loads and sends**

Update calls:

```ts
getMessages(activeSessionID, activeDirectory)
getTodos(activeSessionID, activeDirectory)
getSessionDiff(activeSessionID, messageID, activeDirectory)
sendPrompt(activeSessionID, { ..., directory: activeDirectory })
```

- [ ] **Step 4: Verify types**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
```

Expected: exit 0.

### Task 6: Real LAN Verification And Commit

**Covers:** [S6]

**Files:**
- No source edit expected unless verification finds a defect.

**Interfaces:**
- Consumes all prior tasks.

- [ ] **Step 1: Run full available verification**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
```

Expected: both exit 0.

- [ ] **Step 2: Restart 8090**

Run the same non-persistent startup pattern used in this session:

```bash
HOST=0.0.0.0 PORT=8090 PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm start -w server > /tmp/mimo-code-webui-8090.log 2>&1 &
```

Expected: `http://127.0.0.1:8090/` serves the new `assets/index-*.js`.

- [ ] **Step 3: Browser verify first launch**

With Playwright on `http://192.168.10.236:8090/`, clear `mimo-webui-active-session`, `mimo-webui-owned-session-ids`, and attachment/attached keys. Assert the page shows the workspace-first empty state and no `POST /api/session` occurs before clicking create.

- [ ] **Step 4: Browser verify workspace create**

Open new-session dialog, enter `/vol2/1000/下载/mimo/mimo-code-webui`, create. Assert network saw `POST /api/session?directory=%2Fvol2%2F1000%2F...` and no JSON body `directory` field. Assert the returned session is active and has that directory.

- [ ] **Step 5: Browser verify explicit attach**

Use an existing session ID from `GET /api/session`, clear WebUI ownership, open attach dialog, attach it, and assert it appears in sidebar only after the attach action.

- [ ] **Step 6: Commit**

Run:

```bash
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=/vol2/1000/下载/mimo/mimo-code-webui git add docs/compose/specs/2026-07-06-workspace-session-design.md docs/compose/plans/2026-07-06-workspace-sessions.md web/src
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=/vol2/1000/下载/mimo/mimo-code-webui git -c user.name=yaozy2020 -c user.email=yaozy2020@users.noreply.github.com commit -m "feat: add workspace-aware sessions"
```

Expected: commit succeeds after verification.

---

## Self-Review

- Spec coverage: S1 covered by Task 3 and Task 5; S2 by Task 1 and Task 5; S3 by Task 2, Task 3, Task 4; S4 by Task 3, Task 4, Task 5; S5 by Tasks 1-5; S6 by Task 6.
- Placeholder scan: no TBD/TODO/deferred implementation placeholders in active tasks; deferred scope is explicit in spec.
- Type consistency: API signatures consistently use optional `directory`; store actions are introduced before UI tasks consume them.
