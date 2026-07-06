# Multi Session Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-session blocking state visible and manageable in the WebUI sidebar.

**Architecture:** Keep the current single active chat and modal dialogs. Add per-session pending maps for permissions/questions, update them from bootstrap and SSE, and render compact badges in the existing sidebar.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, MiMo serve HTTP/SSE API.

## Global Constraints

- Verify through `http://192.168.10.236:8090/` with real MiMo serve state.
- Use `npm run typecheck -w web` and `npm run build -w web` as gates.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for npm commands.
- Keep the UI compact; do not introduce a new backend route.

---

### Task 1: Per-Session Pending Store

**Files:**
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/hooks/useStreamingMessage.ts`

**Interfaces:**
- Produces `pendingPermissions: Record<string, PermissionRequest[]>`.
- Produces `pendingQuestions: Record<string, QuestionRequest[]>`.
- Keeps `pendingPermission` and `pendingQuestion` as the current active dialog item.

- [ ] Bootstrap `/permission` and `/question` into per-session maps.
- [ ] Upsert `permission.asked` and `question.asked` into maps.
- [ ] Remove replied/rejected requests from maps.
- [ ] When the active session changes, show the first pending item for that session.

### Task 2: Sidebar Status Badges

**Files:**
- Modify: `web/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes `agentStatus`, `pendingPermissions`, `pendingQuestions`, `todos`, and `sessionDiffs`.
- Renders compact badges per session: `运行中`, `授权`, `提问`, `任务`, `变更`.

- [ ] Add badges below each session title.
- [ ] Keep mobile and desktop sidebars using the same `SessionList`.
- [ ] Verify with existing session data and real pending events.
