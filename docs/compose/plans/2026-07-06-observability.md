# Observability Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/session-diff-git-verification.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real tool calls and file diffs from MiMo serve in the WebUI.

**Architecture:** Preserve the existing message list and toolbar. Extend the frontend types and message mapper to retain official `tool` parts, store `session.diff` events in app state, and render compact summaries in the chat UI.

**Tech Stack:** React 18, TypeScript, Vite, MiMo serve SSE/session API.

## Global Constraints

- Verify through `http://192.168.10.236:8090/` and real MiMo actions.
- Use `npm run typecheck -w web` and `npm run build -w web` only.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for npm commands.
- Keep this to display/observability; do not redesign the full message system.

---

### Task 1: Tool Part Display

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/session.ts`
- Modify: `web/src/components/chat/MessageBubble.tsx`

**Interfaces:**
- Consumes official message part `{ type: "tool", tool, callID, state }`.
- Produces compact UI showing tool name, status, input, output, and error.

- [ ] Extend message part types for `tool` and `reasoning`.
- [ ] Preserve tool parts in `rawToMessage`.
- [ ] Render tool part cards under assistant messages.
- [ ] Verify with a real webfetch prompt.

### Task 2: Session Diff Display

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/hooks/useStreamingMessage.ts`
- Modify: `web/src/components/chat/PromptToolbar.tsx`

**Interfaces:**
- Consumes official `session.diff` event `{ sessionID, diff: [{ file, patch, additions, deletions, status }] }`.
- Produces toolbar summary of changed files and first few file names.

- [ ] Add `SnapshotFileDiff` type and `sessionDiffs` store.
- [ ] Handle `session.diff` SSE event.
- [ ] Render file count and add/delete totals in the toolbar.
- [ ] Verify with a real small file edit from the WebUI agent.
