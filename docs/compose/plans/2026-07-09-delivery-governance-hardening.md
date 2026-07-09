# Delivery Governance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove current delivery blockers by hardening `/status`, adding a repeatable verification command, and recording browser-smoke evidence.

**Architecture:** Keep runtime behavior unchanged except for public status redaction. Add a small status sanitizer plus focused test, wire existing standalone regression tests into one npm script, then run build/typecheck/HTTP/browser smoke and update the governance report.

**Tech Stack:** Express, TypeScript, npm workspaces, Node/tsx smoke tests, Chromium/HTTP verification.

## Global Constraints

- Do not expose full MiMo provider config from public `/status`.
- Do not add auth to `/status`; frontend still needs public auth discovery.
- Do not implement unrelated UI features in this governance pass.
- Do not commit changes.
- Attempt browser smoke as requested; if local Chromium still fails, record the exact blocker and use HTTP evidence as fallback.

---

## File Structure

- `server/src/status.ts`: public status sanitizer and sensitive-key detection helper.
- `server/src/status.test.mjs`: focused redaction regression test.
- `server/src/index.ts`: `/status` uses the sanitized config summary.
- `package.json`: adds a repeatable `verify` command for existing standalone tests plus typecheck/build.
- `docs/compose/reports/delivery-governance-hardening.md`: final report for this governance pass.

---

### Task 1: Harden Public Status Output

**Files:**
- Create: `server/src/status.ts`
- Create: `server/src/status.test.mjs`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `createPublicConfigSummary(config: unknown)` returning a safe provider/model/command summary without secrets.
- Consumes: existing `readMimoConfig()` result inside `/status`.

- [x] **Step 1: Write failing test**

Create `server/src/status.test.mjs` asserting that sanitized output does not include `apiKey`, `token`, `secret`, or raw provider options, while retaining provider/model names.

- [x] **Step 2: Run test and verify failure**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/status.test.mjs
```

- [x] **Step 3: Implement sanitizer and use it in `/status`**

Add `createPublicConfigSummary()` and replace `config: readMimoConfig()` with `config: createPublicConfigSummary(readMimoConfig())`.

- [x] **Step 4: Run focused test**

Run the status test and confirm it passes.

---

### Task 2: Add Unified Verification Command

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run verify` that runs all standalone regression tests, `npm run typecheck`, and `npm run build`.

- [x] **Step 1: Add verify script**

Add a root `verify` script using `tsx` for all existing `.test.mjs` files.

- [x] **Step 2: Run verify**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all focused tests, typecheck, and build pass.

---

### Task 3: Browser Smoke And Governance Report

**Files:**
- Create: `docs/compose/reports/delivery-governance-hardening.md`

**Interfaces:**
- Consumes: running WebUI on `http://127.0.0.1:8090/` and LAN endpoint `http://192.168.10.236:8090/` when reachable.
- Produces: documented verification results and remaining delivery risks.

- [x] **Step 1: Run HTTP smoke**

Check `/`, `/status`, and absence of sensitive keys in `/status` response.

- [x] **Step 2: Attempt browser smoke**

Use available headless Chromium or browser tooling to load `http://127.0.0.1:8090/`. Record success or exact crash output.

- [x] **Step 3: Write report**

Summarize fixes, commands run, browser-smoke result, and remaining risks.
