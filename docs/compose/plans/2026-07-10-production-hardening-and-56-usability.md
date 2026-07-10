# Production Hardening And 5.6 Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MiMo Code WebUI fit controlled production use and isolate whether model 5.6 is safe for orchestrated agent workflows.

**Architecture:** Keep the WebUI/server split intact. Harden auth, release, observability, and regression coverage in small layers, while treating the 5.6 actor failure as a runtime compatibility issue until a minimal reproducible case proves otherwise.

**Tech Stack:** Node.js 18+, Express 4, React 18, Vite, TypeScript, shell scripts, local/self-hosted verification.

## Global Constraints

- Keep changes minimal and source-only; do not edit `web/dist` or `server/dist`.
- Run workspace commands from the repository root.
- Use `npm run verify` before claiming completion.
- Preserve single-user local defaults; production hardening must not break `HOST=127.0.0.1 npm start`.
- Treat 5.6 background actor no-output as untrusted until reproduced and isolated.

---

## File Structure

- `server/src/app.ts`: auth cookie support, request IDs, security headers, route tests.
- `server/src/app.test.mjs`: regression tests for cookie auth, security headers, public/private route behavior.
- `web/src/components/auth/AuthDialog.tsx`: stop persisting bearer token in `localStorage` after cookie login is available.
- `web/src/stores/appStore.tsx`: remove token persistence path after UI migration.
- `web/src/api/client.ts`: fetch with credentials and no longer depend on `localStorage` bearer token for normal auth.
- `scripts/verify-release.sh`: local/self-hosted gate for tests, typecheck, build, and production dependency audit.
- `scripts/start.sh`: production release mode should fail if build output or dependencies are missing instead of mutating the server at startup.
- `docs/operations.md`: operational checklist, 5.6 compatibility note, rollback guidance.
- `scripts/model-runtime-smoke.mjs`: reproducible 5.5/5.6 orchestration smoke test when runtime APIs are available from CLI or HTTP.

### Task 1: Cookie-Based Auth For Production

**Covers:** auth token leakage, XSS blast radius, production session handling

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/app.test.mjs`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/components/auth/AuthDialog.tsx`
- Modify: `web/src/stores/appStore.tsx`

**Interfaces:**
- Produces: `POST /login` accepting `{ token: string }`, setting `mimo_webui_auth` as `HttpOnly; SameSite=Lax` cookie.
- Produces: `POST /logout` clearing `mimo_webui_auth`.
- Consumes: existing `AUTH_TOKEN` env var and existing bearer auth as a temporary compatibility path.

- [ ] **Step 1: Write failing server tests**

Add tests to `server/src/app.test.mjs` proving that `/api/config` is accepted with the auth cookie and rejected without auth.

Run: `node --import tsx server/src/app.test.mjs`

Expected: FAIL because `/login` and cookie auth do not exist.

- [ ] **Step 2: Implement cookie auth in Express**

In `server/src/app.ts`, parse `Cookie`, compare cookie token with the same timing-safe path used for bearer auth, add `POST /login`, and add `POST /logout`.

Keep bearer support for one release so existing users are not locked out.

- [ ] **Step 3: Move frontend auth off localStorage**

Change `fetchJson`, event streams, `/local-*` fetches, and auth dialog submit to use `credentials: "same-origin"` and `/login`.

Remove new writes to `mimo-webui-auth-token`; optionally read it once as a migration fallback, then clear it after successful cookie login.

- [ ] **Step 4: Verify auth behavior**

Run: `node --import tsx server/src/app.test.mjs && npm run typecheck -w web`

Expected: cookie auth tests pass and web typecheck exits 0.

### Task 2: Local Release Gate Without GitHub Minutes

**Covers:** missing CI, GitHub quota limits, human-only verification, dependency audit drift

**Files:**
- Create: `scripts/verify-release.sh`
- Modify: `docs/operations.md`

**Interfaces:**
- Produces: a local/self-hosted release gate running `npm ci` when requested, `npm run verify`, and `npm audit --omit=dev`.

- [ ] **Step 1: Add local release gate script**

Create `scripts/verify-release.sh` with `set -euo pipefail`. It should run `npm ci` only when `VERIFY_RELEASE_CI_INSTALL=true`, then run `npm run verify` and `npm audit --omit=dev`.

- [ ] **Step 2: Run the exact workflow commands locally**

Run: `./scripts/verify-release.sh`

Expected: all commands exit 0.

- [ ] **Step 3: Document the release gate**

In `docs/operations.md`, add: no release is accepted unless `./scripts/verify-release.sh` is green on the release commit. If GitHub Actions quota becomes available later, this script can be called from CI unchanged.

### Task 3: Production Start Must Be Immutable

**Covers:** startup mutation, unrepeatable deployment, release rollback confidence

**Files:**
- Modify: `scripts/start.sh`
- Modify: `docs/deployment.md`

**Interfaces:**
- Produces: `MIMO_WEBUI_STRICT_RELEASE=true` mode where missing `node_modules`, `web/dist`, or `server/dist` fails fast.

- [ ] **Step 1: Write shell-level smoke expectation**

Run `MIMO_WEBUI_STRICT_RELEASE=true ./scripts/start.sh` in a temporary copy with `web/dist` removed.

Expected before implementation: script tries to build instead of failing fast.

- [ ] **Step 2: Implement strict release guard**

In `scripts/start.sh`, before install/build sections, check `MIMO_WEBUI_STRICT_RELEASE=true`; if required outputs are missing, print a clear error and exit 1.

- [ ] **Step 3: Document production usage**

In `docs/deployment.md`, set `MIMO_WEBUI_STRICT_RELEASE=true` in the systemd environment example and explain that build/install belongs in CI or release packaging.

### Task 4: Observability Baseline

**Covers:** lack of request IDs, structured logs, operational debugging

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/app.test.mjs`
- Modify: `docs/operations.md`

**Interfaces:**
- Produces: `X-Request-ID` response header and structured one-line request logs with route, status, duration, and request ID.

- [ ] **Step 1: Add failing test for request ID header**

In `server/src/app.test.mjs`, assert `/status` returns `X-Request-ID` and preserves incoming `X-Request-ID` if supplied.

Run: `node --import tsx server/src/app.test.mjs`

Expected: FAIL because no request ID middleware exists.

- [ ] **Step 2: Add request ID middleware**

In `server/src/app.ts`, generate `crypto.randomUUID()` when no incoming request ID is supplied, set response header, and include it in route error logs.

- [ ] **Step 3: Verify**

Run: `node --import tsx server/src/app.test.mjs && npm run typecheck -w server`

Expected: tests and typecheck pass.

### Task 5: End-To-End Browser Smoke

**Covers:** no real WebUI session regression, history restore, streaming path confidence

**Files:**
- Modify: `scripts/browser-smoke.mjs`
- Modify: `docs/testing.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run smoke:browser` exercising page load, auth prompt behavior, session list render, and long-history rendering when test data is available.

- [ ] **Step 1: Extend browser smoke with visible UI assertions**

Check that the app renders either the workspace start screen or the chat shell without console errors.

- [ ] **Step 2: Add history regression path**

When `SMOKE_SESSION_ID` is set, open that session and assert more than 50 messages can render after the pagination fix.

- [ ] **Step 3: Verify**

Run: `npm run smoke:browser` against a running local server.

Expected: smoke exits 0 and prints checked URL plus assertions.

### Task 6: 5.6 Runtime Compatibility Gate

**Covers:** background actor no-output, orchestration reliability, model switch safety

**Files:**
- Create: `scripts/model-runtime-smoke.mjs`
- Modify: `docs/operations.md`

**Interfaces:**
- Produces: a documented manual/automated checklist comparing 5.5 and 5.6 on direct chat, tool use, background actor, and actor result delivery.

- [ ] **Step 1: Record the known failure mode**

In `docs/operations.md`, document: with 5.6, background actors in this session returned `idle`, `turnCount: 0`, and no output immediately after spawn.

- [ ] **Step 2: Build the smallest reproducible smoke**

Create `scripts/model-runtime-smoke.mjs` only if the local CLI exposes enough API to select model and spawn a background agent. The smoke should run one direct prompt and one background task for each configured model, then assert non-empty output.

- [ ] **Step 3: Define 5.6 rollout rule**

Document that 5.6 is allowed for direct single-agent chat only after direct prompt smoke passes; it is not allowed for compose/subagent/actor workflows until background result delivery passes twice consecutively.

- [ ] **Step 4: Verify manually if automation is not available**

Run one 5.5 and one 5.6 session with the same prompt: `spawn a background actor that returns the string READY`. Expected for usable runtime: actor `turnCount > 0` and final output contains `READY`.

### Task 7: Final Production Readiness Review

**Covers:** release decision, residual risk, go/no-go criteria

**Files:**
- Create: `docs/compose/reports/production-hardening-and-56-usability.md`

**Interfaces:**
- Consumes: outputs from Tasks 1-6.
- Produces: final go/no-go report.

- [ ] **Step 1: Run full verification**

Run: `npm run verify && npm audit --omit=dev`

Expected: both exit 0.

- [ ] **Step 2: Write final report**

Record completed tasks, commands run, residual risks, and a production readiness verdict.

- [ ] **Step 3: Commit**

Commit only the files changed for this hardening batch, with a message such as `chore: harden production readiness baseline`.

## Self-Review

- Spec coverage: auth leakage, CI gap, startup mutation, observability gap, E2E gap, and 5.6 actor failure each map to a task.
- Placeholder scan: no task uses TBD/TODO/fill-in wording.
- Type consistency: produced interfaces are concrete route names, env var names, script names, or existing command names.
