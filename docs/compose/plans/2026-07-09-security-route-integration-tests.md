# Security Route Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable integration-style coverage for the security-critical backend routes.

**Architecture:** Extract minimal Express app construction from `server/src/index.ts` into a testable function while keeping production startup behavior unchanged. Tests instantiate the app with injected config/health handlers and use Node's local HTTP server plus `fetch` to verify auth, status redaction, and unsafe `baseUrl` rejection.

**Tech Stack:** Express, TypeScript, Node/tsx test scripts, npm workspaces.

## Global Constraints

- Do not start real `mimo serve` in integration tests.
- Do not broaden route behavior beyond the security checks under test.
- Keep `/status` public.
- Keep `/local-run` and `/local-config` protected by auth when `AUTH_TOKEN` is set.
- Do not commit changes.

---

## File Structure

- `server/src/app.ts`: new testable Express app factory with auth middleware and local routes.
- `server/src/index.ts`: production startup imports app factory and wires real runtime dependencies.
- `server/src/app.test.mjs`: HTTP-level route security tests.
- `package.json`: includes `server/src/app.test.mjs` in `npm run verify`.

---

### Task 1: Add Security Route Integration Coverage

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/app.test.mjs`
- Modify: `server/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `createApp(options)` returning an Express app without listening.
- Consumes: existing config helpers and runtime handlers from `index.ts`.

- [ ] **Step 1: Write failing integration tests**

Create tests for:

- `/status` returns public status and does not include sensitive config keys.
- `/local-run` returns 401 without bearer auth when auth is configured.
- `/local-config/models` rejects `http://169.254.169.254/latest/meta-data` with 400 under valid auth.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/app.test.mjs
```

Expected: fail because `server/src/app.ts` does not exist.

- [ ] **Step 3: Extract app factory**

Move the route setup needed by tests into `createApp(options)` without changing production route order.

- [ ] **Step 4: Run route tests**

Run `node --import tsx server/src/app.test.mjs` and confirm it passes.

- [ ] **Step 5: Add to verify**

Add `server/src/app.test.mjs` to the root `verify` script.

- [ ] **Step 6: Run full verification**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run smoke:browser
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run smoke:browser:system
```
