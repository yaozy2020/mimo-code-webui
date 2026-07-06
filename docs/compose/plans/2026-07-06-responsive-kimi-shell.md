# Responsive Kimi-style Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the MiMoCode WebUI shell and chat surface with Kimi-inspired visual polish and reliable mobile adaptation.

**Architecture:** Make presentation-only changes to the existing React/Tailwind shell. Preserve protocol, stores, hooks, session routing, attachments, and API behavior.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, local shadcn-style components.

## Global Constraints

- Do not edit `web/src/api/*`, `web/src/hooks/*`, `web/src/stores/*`, or `server/src/*` for this UI slice.
- User-facing copy remains Chinese.
- Mobile viewport around 375px must not have horizontal overflow.
- Dialogs must fit inside `100dvh` and scroll internally.
- Typecheck/build and LAN browser smoke are required before completion.

---

## File Structure

- Modify `web/src/index.css`: global background and responsive utility safety.
- Modify `web/src/App.tsx`: app shell sizing and background.
- Modify `web/src/components/ui/dialog.tsx`: viewport-safe modal layout.
- Modify `web/src/components/layout/Header.tsx`: compact Kimi-like header and mobile model selector behavior.
- Modify `web/src/components/layout/Sidebar.tsx`: softer workbench sidebar and touch-safe drawer.
- Modify `web/src/components/chat/ChatArea.tsx`: responsive empty states and layout spacing only.
- Modify `web/src/components/chat/InputBar.tsx`: compact mobile composer and mode controls.
- Modify `web/src/components/chat/MessageList.tsx`: mobile padding and scroll comfort.
- Modify `web/src/components/chat/MessageBubble.tsx`: touch-safe copy action and overflow handling.
- Modify `web/src/components/chat/PromptToolbar.tsx`: compact mobile chips.
- Modify `web/src/components/files/FileChangesPanel.tsx`: mobile overlay, desktop side panel later breakpoint.

### Task 1: Shell and Dialog Foundation

**Covers:** [S1], [S3], [S4]

**Files:**
- Modify: `web/src/index.css`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/ui/dialog.tsx`

**Steps:**

- [ ] Update app shell to use dynamic viewport height and soft workbench background.
- [ ] Ensure top-level layout keeps `min-h-0` on flex children so chat can scroll correctly.
- [ ] Change `Dialog` container to `max-h-[calc(100dvh-1rem)]`, `w-[calc(100vw-1rem)]`, `overflow-y-auto`, and mobile-safe padding.
- [ ] Run `npm run typecheck -w web`.

### Task 2: Header and Sidebar Responsive Workbench

**Covers:** [S3], [S4], [S5]

**Files:**
- Modify: `web/src/components/layout/Header.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

**Steps:**

- [ ] Restyle Header as compact translucent workbench bar.
- [ ] Make model selector width responsive so it does not dominate mobile header.
- [ ] Keep mobile menu/settings/diagnostics reachable as icons.
- [ ] Restyle Sidebar session rows with better active state, path title attributes, and touch-safe actions.
- [ ] Keep mobile drawer at `max-w-[88vw]` with safe bottom padding.
- [ ] Run `npm run typecheck -w web`.

### Task 3: Chat Surface and Composer

**Covers:** [S1], [S3], [S4], [S5]

**Files:**
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/components/chat/InputBar.tsx`
- Modify: `web/src/components/chat/MessageList.tsx`
- Modify: `web/src/components/chat/MessageBubble.tsx`
- Modify: `web/src/components/chat/PromptToolbar.tsx`

**Steps:**

- [ ] Make empty states scroll-safe on short mobile heights.
- [ ] Reduce mobile message padding and prevent text overflow.
- [ ] Move message copy action inside or visibly touch-accessible on mobile.
- [ ] Reduce mobile composer textarea minimum height.
- [ ] Cap attachment/suggestion blocks with internal scrolling.
- [ ] Add mobile-safe bottom padding for the composer.
- [ ] Make mode controls touch-readable without creating horizontal overflow.
- [ ] Collapse PromptToolbar density on mobile by keeping summaries compact.
- [ ] Run `npm run typecheck -w web`.

### Task 4: File Panel Responsive Behavior

**Covers:** [S4], [S5]

**Files:**
- Modify: `web/src/components/files/FileChangesPanel.tsx`

**Steps:**

- [ ] Make the file changes panel a fixed full-height overlay below desktop-large widths.
- [ ] Keep the right-side panel only at `lg` or wider.
- [ ] Ensure patch/content previews scroll internally and do not force page overflow.
- [ ] Run `npm run typecheck -w web`.

### Task 5: Verification

**Covers:** [S6]

**Files:**
- No source edit expected unless verification finds a defect.

**Steps:**

- [ ] Run `npm run typecheck -w web`.
- [ ] Run `npm run build -w web`.
- [ ] Restart 8090 and confirm new asset is served.
- [ ] Browser smoke desktop `1440x900`: sidebar, header, chat, composer, file panel.
- [ ] Browser smoke tablet `768x900`: drawer/panel behavior and no horizontal overflow.
- [ ] Browser smoke mobile `375x812`: menu drawer, dialogs, chat readability, composer, and no horizontal overflow.

---

## Self-Review

- Spec coverage: S1 covered by Tasks 1 and 3; S2 by all task constraints; S3 by Tasks 1-3; S4 by Tasks 1-5; S5 by Tasks 2-4; S6 by Task 5.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: UI-only plan avoids API/store/hook type changes.
