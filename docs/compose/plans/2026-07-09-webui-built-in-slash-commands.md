# WebUI Built-In Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect built-in slash commands that the current WebUI can execute safely.

**Architecture:** Extend the existing frontend slash command catalog with executable command types. Prompt commands expand into normal prompt text; UI commands call existing WebUI actions such as opening settings, showing sessions, or opening the new-session dialog.

**Tech Stack:** React 18, TypeScript, Vite, local Node/tsx tests.

## Global Constraints

- Do not fake commands that require missing runtime APIs, including `/undo`, `/redo`, `/share`, `/unshare`, and `/connect`.
- Keep backend routes unchanged for this slice.
- Preserve existing local template commands.
- Verify with focused parser tests, web typecheck, and full build.

---

## File Structure

- `web/src/components/chat/slashCommands.ts`: command catalog now supports prompt and action commands.
- `web/src/components/chat/slashCommands.test.mjs`: regression tests for built-in commands, aliases, and action classification.
- `web/src/components/chat/InputBar.tsx`: executes slash action commands and still sends prompt commands normally.
- `web/src/components/chat/ChatArea.tsx`: handles chat-local slash actions such as new session.
- `web/src/App.tsx`: passes app-level slash actions for settings/models and sessions/sidebar.

---

### Task 1: Connect Executable Built-In Slash Commands

**Files:**
- Modify: `web/src/components/chat/slashCommands.ts`
- Modify: `web/src/components/chat/slashCommands.test.mjs`
- Modify: `web/src/components/chat/InputBar.tsx`
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `InputBar.onSend(text, mode, attachments)` and existing App/ChatArea dialog/sidebar setters.
- Produces: `SlashAction` callbacks for `help`, `models`, `sessions`, and `new-session`.

- [x] **Step 1: Write failing parser tests**

Add tests that assert `/models` returns an action command, `/resume` aliases sessions, `/compact` expands to a prompt, and `/summarize` aliases compact.

- [x] **Step 2: Run parser tests and verify they fail**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/components/chat/slashCommands.test.mjs
```

- [x] **Step 3: Implement command catalog and parser changes**

Add prompt commands `/init`, `/compact`, `/summarize`; add action commands `/help`, `/models`, `/sessions`, `/resume`, `/continue`, `/new`, `/clear`.

- [x] **Step 4: Wire action commands into UI**

Pass `onSlashAction` from App/ChatArea/InputBar and execute existing UI actions.

- [x] **Step 5: Run focused tests**

Run the slash command parser test.

- [x] **Step 6: Run verification**

Run web typecheck and full build.
