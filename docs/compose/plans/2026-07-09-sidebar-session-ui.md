# Sidebar Session UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve desktop session-sidebar usability while preserving the mobile drawer flow.

**Architecture:** Keep all changes inside the existing sidebar/session-source surface. Rework `Sidebar.tsx` markup and Tailwind classes for denser desktop cards, stable touch behavior on mobile, and source labels from `getSessionSource` instead of hardcoded copy.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, local shadcn-style UI components.

## Global Constraints

- Do not change session ownership/storage semantics in this UI pass.
- Do not add new dependencies or new UI primitives.
- Keep the mobile drawer behavior and close-on-select behavior intact.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm verification commands.
- Verify with `npm run typecheck -w web` and `npm run build`.

---

## File Structure

- `web/src/components/layout/Sidebar.tsx`: owns the desktop aside, mobile drawer, session list header, session cards, status badges, and session action buttons.
- `web/src/components/chat/sessionSource.ts`: already owns attached-session label semantics; no behavior change expected beyond using its label in Sidebar.

---

### Task 1: Refine Session Sidebar Layout

**Files:**
- Modify: `web/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useSessions`, `useAppState`, `getSessionSource`, `WorkspaceSessionDialog`, `AttachSessionDialog`.
- Produces: same session actions with improved desktop density and mobile touch affordance.

- [x] **Step 1: Confirm current hardcoded source label**

Run: `grep` or `rg` for `外部会话` in `web/src/components/layout/Sidebar.tsx`.

Expected: Sidebar hardcodes `外部会话`, which should be replaced with `source.label`.

- [x] **Step 2: Update Sidebar markup and classes**

Change `SessionList` to accept an `isMobile` prop. Use it to keep action buttons visible on mobile but hover-revealed on desktop.

Required behavior:

```text
Desktop:
- aside width near 300px, not visually heavy
- header has compact workspace path and two icon buttons
- session cards are single clickable rows/cards with light active state
- actions are horizontal and appear on hover/focus

Mobile:
- drawer remains max 88vw
- actions remain visible for touch
- card content still truncates instead of overflowing
```

- [x] **Step 3: Use sessionSource label consistently**

Replace the hardcoded source badge text with:

```tsx
{source.external && <Badge variant="secondary">{source.label}</Badge>}
```

- [x] **Step 4: Verify source tests still pass**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/components/chat/sessionSource.test.mjs`

Expected: all tests pass.

- [x] **Step 5: Verify web typecheck and production build**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

Expected: both commands pass.

- [x] **Step 6: Verify served bundle updates**

Run: `curl -sS http://127.0.0.1:8090/`

Expected: returned HTML references the latest built JS asset.
