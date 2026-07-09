# Delivery Governance Hardening Report

## Summary

This governance round removed the current public `/status` delivery blocker, added a repeatable verification command, rebuilt the app, and restarted the LAN WebUI entrypoint on `0.0.0.0:8090` with the hardened bundle.

## Changes

- Added `server/src/status.ts` with `createPublicConfigSummary()` and sensitive-key detection.
- Updated `server/src/index.ts` so public `/status` returns only a safe config summary.
- Added `server/src/status.test.mjs` to assert `/status` summaries do not expose `apiKey`, `token`, `secret`, `authorization`, or raw secret values.
- Added root `npm run verify` to run all standalone regression tests, then typecheck and build.

## Verification

Passed:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/status.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

`npm run verify` covered:

- `server/src/config.test.mjs`
- `server/src/status.test.mjs`
- `web/src/components/chat/modelRouting.test.mjs`
- `web/src/components/chat/sessionSource.test.mjs`
- `web/src/components/chat/slashCommands.test.mjs`
- `web/src/lib/messageOrder.test.mjs`
- `web/src/lib/streamingDisplay.test.mjs`
- `web/src/lib/time.test.mjs`
- `npm run typecheck`
- `npm run build`

Runtime checks:

```bash
curl -fsS http://127.0.0.1:8090/status
curl -fsS http://192.168.10.236:8090/status | rg -i 'apiKey|token|secret|authorization|sk-'
curl -fsS http://192.168.10.236:8090/ | rg 'assets/index'
```

The sensitive-key grep produced no output after restarting the LAN WebUI on `8090`.

## Browser Smoke

Follow-up resolved the local browser-smoke blocker by installing `@playwright/test` and Playwright-managed Chromium into ignored project directory `.playwright-browsers/`, avoiding the broken system Chromium 148 crashpad path and the user-cache permission issue under `/home/yzy/.cache`.

Passed:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run smoke:browser:install
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run smoke:browser
```

Output:

```text
browser smoke passed: http://127.0.0.1:8090/
```

The smoke script lives at `scripts/browser-smoke.mjs` and checks that the WebUI DOM loads and includes `MiMo Code`.

### Previous System Chromium Failure

Follow-up root-cause investigation found the default shell is running as user `com.dustinky.qwenpaw` (`uid=981`) while `HOME=/home/yzy`. Chromium tries to derive its crashpad/config paths from that `HOME`, but `/home/yzy/.config/chromium` is mode `700` and owned by `yzy:Users`, so the current process cannot enter it. That causes Chromium crashpad startup to fail before any page loads.

The project now includes a system-Chromium smoke script that sets an isolated writable browser home instead of using the mismatched default `HOME`:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run smoke:browser:system
```

Output:

```text
system chromium smoke passed: http://127.0.0.1:8090/
```

Attempted Chromium smoke with:

```bash
chromium --headless=new --no-sandbox --disable-gpu --disable-crash-reporter --disable-crashpad --user-data-dir=/tmp/mimo-webui-chrome-smoke --dump-dom http://127.0.0.1:8093/
chromium --headless=new --no-sandbox --disable-gpu --user-data-dir=/tmp/mimo-webui-chrome-smoke2 --crash-dumps-dir=/tmp/mimo-webui-crashpad --dump-dom http://127.0.0.1:8093/
```

Both attempts were blocked by the local Chromium crashpad startup failure:

```text
chrome_crashpad_handler: --database is required
```

HTTP-level runtime verification passed, but browser DOM smoke remains an environment blocker.
The blocker applies to launching system `/usr/bin/chromium` with the inherited mismatched `HOME`. System Chromium works when launched with an isolated writable `HOME`/`XDG_CONFIG_HOME`.

## Remaining Risks

- The worktree is still a mixed dirty stack and should be split before formal handoff.
- The inherited process environment still has `HOME=/home/yzy` while running as `com.dustinky.qwenpaw`; use `npm run smoke:browser:system` or `npm run smoke:browser` until the service/shell environment sets a writable HOME for the actual runtime user.
- Commands that need backend/runtime API support (`/undo`, `/redo`, `/share`, `/connect`, `/export`) are still intentionally not implemented.
