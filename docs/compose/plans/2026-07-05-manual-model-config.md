# Manual Model Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add/select models manually while keeping the WebUI connected to the current MiMo instance.

**Architecture:** The Express backend remains the bridge to the running `mimo serve` instance. The frontend combines runtime models from `/api/config` with user-added local models, and the backend exposes a minimal `/local-config/models` endpoint that can append model definitions to `~/.mimo/mimo.config.json`.

**Tech Stack:** Express, TypeScript, React, localStorage, MiMo `/config` and `/session/:id/prompt_async` APIs.

## Global Constraints

- Verify through the real LAN URL `http://192.168.10.236:8090/` before claiming success.
- Do not parse `/api/*` bodies before proxying to `mimo serve`.
- Keep changes minimal and do not edit generated `web/dist` directly.

---

### Task 1: Backend Manual Model Endpoint

**Covers:** manual backend configuration write.

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `GET /local-config/models` and `POST /local-config/models`.
- Produces: `addMimoModelConfig(input)` that persists `provider.<providerID>.models.<modelID>`.

- [ ] Add typed read/write helpers for MiMo config.
- [ ] Add non-`/api` Express routes after `express.json()` is active.
- [ ] Verify with `curl` that POST writes and GET returns models.

### Task 2: Frontend Manual Model UI

**Covers:** user-visible manual model configuration.

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/components/settings/SettingsPanel.tsx`
- Modify: `web/src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: backend local model endpoints.
- Produces: combined runtime + local model options using values formatted as `providerID/modelID`.

- [ ] Add client helpers for local model fetch/create.
- [ ] Store manually added models in localStorage for immediate browser-side use.
- [ ] Add a compact form in Settings for provider ID, model ID, display name, base URL, API key, and “also write backend config”.
- [ ] Refresh model options after save.

### Task 3: Verification

**Covers:** real entrypoint behavior.

**Files:**
- Modify as needed from Tasks 1-2 only.

- [ ] Run `npm run typecheck -w web`.
- [ ] Run `npm run build -w web`.
- [ ] Run `npm run typecheck -w server`.
- [ ] Verify LAN page loads the latest asset, manual model appears in top selector, and prompt body contains `model.providerID/modelID` object.
