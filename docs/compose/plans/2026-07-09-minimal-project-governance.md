# Minimal Project Governance Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/minimal-project-governance.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current WebUI source tree out of temporary debugging mode without changing product behavior.

**Architecture:** Keep the existing React/Vite frontend and Express backend unchanged. Remove only temporary frontend `[DEBUG]` logs that were added for diagnosis, preserve normal server/runtime logs, and verify with the repository's existing TypeScript and build gates.

**Tech Stack:** React 18, TypeScript strict mode, Vite, Express, npm workspaces.

## Global Constraints

- Do not add features, refactors, new dependencies, or broad cleanup beyond temporary debug log removal.
- Preserve normal operational logs in `server/src/*`, `server/src/proxy.ts`, and `server/src/mimo.ts`.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm commands in this environment.
- Use existing verification gates only: `npm run typecheck` and `npm run build`.
- Do not commit unless the user explicitly asks for a commit.

---

## File Structure

- `web/src/components/chat/ChatArea.tsx`: remove temporary `[DEBUG]` `console.log` statements and now-unused debug-only variables.
- `web/src/hooks/useStreamingMessage.ts`: remove temporary `[DEBUG]` `console.log` statements and now-unused debug-only variables.
- `web/src/stores/appStore.tsx`: remove temporary `[DEBUG]` `console.log` statements while preserving reducer behavior.

---

### Task 1: Remove Temporary Frontend Debug Logging

**Files:**
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/hooks/useStreamingMessage.ts`
- Modify: `web/src/stores/appStore.tsx`

**Interfaces:**
- Consumes: existing chat message loading, streaming, and app reducer behavior.
- Produces: same runtime behavior without noisy temporary frontend debug logs.

- [x] **Step 1: Confirm current debug log sites**

Run: `grep` or `rg` equivalent for `\[DEBUG\]|console\.log` under `web/src`.

Expected: temporary logs appear in `ChatArea.tsx`, `useStreamingMessage.ts`, and `appStore.tsx`. The `modelRouting.test.mjs` success log is not source runtime UI code and can remain.

- [x] **Step 2: Remove only temporary runtime debug statements**

Edit the three source files to remove statements whose log string starts with `[DEBUG]`.

Expected: no user-visible UI behavior changes, no changes to request payloads, reducers, streaming logic, or normal error logging.

- [x] **Step 3: Verify no temporary frontend debug logs remain**

Run: `rg "\[DEBUG\]" web/src`

Expected: no matches in runtime frontend source.

- [x] **Step 4: Run TypeScript verification**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck`

Expected: server and web `tsc --noEmit` both pass.

- [x] **Step 5: Run production build verification**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build`

Expected: web and server builds both pass.

- [x] **Step 6: Summarize remaining worktree state**

Run: `git status --short`

Expected: report remaining modified/untracked files without reverting or staging unrelated user changes.
