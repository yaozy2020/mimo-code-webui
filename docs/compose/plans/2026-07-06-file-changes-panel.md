# File Changes Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side file changes panel that lets users inspect session diffs and preview changed files.

**Architecture:** Reuse existing `sessionDiffs` state and the official `/file/content` endpoint through the existing `/api` proxy. Keep chat as the primary workspace and open a lightweight right panel from the toolbar `变更` badge.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, MiMo serve file/session APIs.

## Global Constraints

- Verify through `http://192.168.10.236:8090/` and real file edits.
- Use `npm run typecheck -w web` and `npm run build -w web` as gates.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for npm commands.
- Do not build a full IDE file tree in this slice.

---

### Task 1: File Read API

**Files:**
- Create: `web/src/api/file.ts`

**Interfaces:**
- Produces `readFileContent(path: string): Promise<FileContent>`.
- Uses official `GET /file/content?path=<path>` via `/api` proxy.

- [ ] Add the API wrapper and type.

### Task 2: File Changes Panel UI

**Files:**
- Create: `web/src/components/files/FileChangesPanel.tsx`
- Modify: `web/src/components/chat/PromptToolbar.tsx`
- Modify: `web/src/components/chat/ChatArea.tsx`

**Interfaces:**
- Consumes `sessionDiffs[sessionID]`.
- Opens from toolbar.
- Shows changed file list, patch preview, and file content preview.

- [ ] Add toolbar callback for opening the panel.
- [ ] Render right-side panel next to chat on desktop and overlay-like full width on small screens.
- [ ] Load file content when a diff item is selected.

### Task 3: Real Verification

**Files:**
- No additional files expected.

**Interfaces:**
- Uses real 8090 browser and a real agent edit to populate `session.diff`.

- [ ] Build and restart WebUI.
- [ ] Trigger a real edit of `docs/compose/diff-verification.txt`.
- [ ] Open the file changes panel.
- [ ] Verify the panel shows the changed file, patch, and current file content.
