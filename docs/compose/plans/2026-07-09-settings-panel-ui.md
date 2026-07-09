# Settings Panel UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the settings panel easier to scan on desktop while keeping mobile behavior usable.

**Architecture:** Keep settings state, API calls, and form behavior unchanged. Reorganize `SettingsPanel.tsx` into clearer visual sections with responsive grid layout, more compact operations, and a wider desktop dialog.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, local shadcn-style components.

## Global Constraints

- Do not change settings persistence or API behavior.
- Do not add dependencies or new UI primitives.
- Keep mobile single-column scrolling usable.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm verification commands.
- Verify with `npm run typecheck -w web` and `npm run build`.

---

## File Structure

- `web/src/components/settings/SettingsPanel.tsx`: owns all settings UI, model selection, manual model form, MiMo restart action, theme switch, auth/logout, and local data clearing.

---

### Task 1: Refine Settings Panel Layout

**Files:**
- Modify: `web/src/components/settings/SettingsPanel.tsx`

**Interfaces:**
- Consumes: existing settings state, model APIs, restart API, local storage cleanup, logout behavior.
- Produces: same behavior with clearer desktop and mobile settings layout.

- [x] **Step 1: Reorganize visible sections**

Create these visual sections in order:

```text
模型与连接
手动模型
界面与安全
危险操作
```

- [x] **Step 2: Improve responsive density**

Use responsive grids so desktop gets two-column grouping for API/base/model/auth fields, while mobile remains one column.

- [x] **Step 3: Keep operations near their context**

Place MiMo restart inside the model/manual-model area, not as a disconnected full-width block.

- [x] **Step 4: Preserve all existing handlers**

Keep `saveManual`, `handleRestartMimo`, `handleClearAll`, `handleLogout`, and all dispatch calls unchanged in behavior.

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
