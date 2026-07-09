# Manual Model Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose model capability flags when manually adding a model.

**Architecture:** Extend the existing manual model input shape with `tool_call`, `attachment`, and `reasoning`. Persist those flags in browser-local models and backend MiMo config, then expose them through the existing SettingsPanel switches.

**Tech Stack:** React 18, TypeScript, Express, Node fs config writer, Tailwind UI components.

## Global Constraints

- Keep capability defaults enabled.
- Do not change model routing rules beyond using persisted capability data.
- Preserve existing manual model save and restart flow.
- Verify with focused model/config tests, web typecheck, and full build.

---

## File Structure

- `server/src/config.ts`: accepts and writes manual model capability flags.
- `web/src/api/client.ts`: sends and stores capability flags for manual models.
- `web/src/components/settings/SettingsPanel.tsx`: adds three switches to the manual model form.
- `server/src/config.test.mjs`: focused regression test for backend config persistence.
- `web/src/components/chat/modelRouting.test.mjs`: existing regression test remains the focused capability display/routing test.

---

### Task 1: Persist Manual Model Capabilities

**Files:**
- Modify: `server/src/config.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/components/settings/SettingsPanel.tsx`
- Create: `server/src/config.test.mjs`

**Interfaces:**
- Consumes: existing `saveManualModel(input, writeBackend)` frontend API and `addMimoModelConfig(input)` backend writer.
- Produces: manual model inputs with optional `tool_call`, `attachment`, and `reasoning` booleans.

- [x] **Step 1: Write failing backend persistence test**

Create `server/src/config.test.mjs` that sets `MIMO_CONFIG_PATH` to a temp file, calls `addMimoModelConfig()` with `tool_call:false`, `attachment:false`, `reasoning:true`, and asserts the written JSON preserves those exact flags.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/config.test.mjs
```

Expected: fail because `ManualModelInput` ignores capability flags and backend always writes defaults.

- [x] **Step 3: Implement backend capability persistence**

Update `ManualModelInput` in `server/src/config.ts` to include optional booleans and write each flag with `input.flag ?? existing.flag ?? true`.

- [x] **Step 4: Implement frontend capability inputs**

Update `ManualModelInput` in `web/src/api/client.ts`, browser model persistence, and `SettingsPanel.tsx` state with three default-on switches.

- [x] **Step 5: Run focused tests**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/config.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/components/chat/modelRouting.test.mjs
```

Expected: both pass.

- [x] **Step 6: Run project verification**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

Expected: both pass.
