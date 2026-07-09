# WebUI Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful slash command templates to the WebUI composer.

**Architecture:** Keep MiMo protocol unchanged. Add a frontend-only slash command parser and menu in `InputBar`; selected commands expand into normal prompt text and choose the appropriate existing agent mode.

**Tech Stack:** React 18, TypeScript, Vite, local Node/tsx tests.

## Global Constraints

- Do not fake runtime `config.command` support; current runtime command config is empty.
- Do not add backend routes for this slice.
- Do not treat `/build`, `/plan`, and `/compose` as the delivered command set because they are only mode aliases.
- Commands must produce normal text plus existing `PromptMode`, so `ChatArea` and `sendPrompt` remain compatible.
- Verify with focused parser tests, web typecheck, and full build.

---

## File Structure

- `web/src/components/chat/slashCommands.ts`: command catalog and pure parser/expander.
- `web/src/components/chat/slashCommands.test.mjs`: focused regression tests.
- `web/src/components/chat/InputBar.tsx`: menu rendering, command selection, keyboard handling, send-time command expansion.

---

### Task 1: Add Local Slash Command Templates

**Files:**
- Create: `web/src/components/chat/slashCommands.ts`
- Create: `web/src/components/chat/slashCommands.test.mjs`
- Modify: `web/src/components/chat/InputBar.tsx`

**Interfaces:**
- Consumes: current `PromptMode` type and `InputBar.onSend(text, mode, attachments)`.
- Produces: selected slash commands that expand into text and mode without backend changes.

- [x] **Step 1: Write failing parser tests**

Create tests for:

```ts
expandSlashCommand("/fix 修复登录失败") -> { handled: true, mode: "build", text: "修复这个问题：修复登录失败" }
expandSlashCommand("/review") -> { handled: true, mode: "plan", text includes "代码审查" }
getSlashCommandMatches("/te") includes /test
```

- [x] **Step 2: Run parser tests and verify they fail**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/components/chat/slashCommands.test.mjs
```

Expected: fails because `slashCommands.ts` does not exist.

- [x] **Step 3: Implement command catalog and parser**

Add useful local commands:

```text
/fix      build   修复问题
/review   plan    做代码审查
/explain  plan    解释代码或项目
/test     build   添加或修复测试
/refactor build   重构并保持行为不变
/docs     build   更新文档
```

- [x] **Step 4: Wire command menu into InputBar**

When textarea starts with `/`, show a small command list above the composer. Clicking an item or pressing Enter while an exact command is selected inserts the command template. Sending text that starts with a known command expands it automatically.

- [x] **Step 5: Run focused tests**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/components/chat/slashCommands.test.mjs
```

Expected: pass.

- [x] **Step 6: Run verification**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

Expected: both pass.
