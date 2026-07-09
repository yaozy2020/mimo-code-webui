---
feature: complete-project-governance
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-07-09-complete-project-governance.md
  - docs/compose/plans/2026-07-09-minimal-project-governance.md
branch: master
commits: uncommitted
---

# Complete Project Governance — Final Report

## What Was Built

The WebUI workspace now has a governed baseline for continuing development without losing or hiding existing work. Local MiMo runtime state is ignored, temporary frontend debug logging has been removed, the current dirty worktree is classified into reviewable slices, and the watchdog script has been converted from a temporary process killer into a documented manual fallback.

No commit was created. The work remains in the current dirty `master` checkout so the user can decide whether to commit slices, continue治理, or run LAN verification first.

## Architecture

Governance state is recorded in `docs/compose/reports/worktree-state-archive.md`. That archive classifies the current tracked and untracked changes into commit candidates: governance hygiene, runtime/backend management, model routing/settings, workspace/session UI, message/file visual polish, and final LAN/runtime verification.

Repository hygiene lives in `.gitignore`, where `.mimo-home/` is now ignored alongside `.mimocode/`. Operational fallback lives in `scripts/mimo-watchdog.sh`; it watches `http://<MIMO_HOST>:<MIMO_PORT>/global/health`, starts `mimo serve` only when unhealthy, and only stops a process recorded in its own `WATCHDOG_PID_FILE`.

### Design Decisions

We chose not to delete or revert dirty files because the current workspace contains several feature lines that may be valuable and were not all created in this turn.

We chose PID-file ownership for the watchdog because broad `pkill -f` can kill a manually managed `mimo serve` process. The productized script only manages the process it started.

## Usage

Normal startup remains through the WebUI backend and existing npm scripts. The watchdog is optional and intended only as a manual fallback:

```bash
scripts/mimo-watchdog.sh
```

Supported watchdog environment variables are documented in `README.md`: `MIMO_HOST`, `MIMO_PORT`, `WATCHDOG_INTERVAL_SEC`, `WATCHDOG_LOG`, and `WATCHDOG_PID_FILE`.

## Verification

Verification completed successfully:

- `git check-ignore -q .mimo-home` confirmed `.mimo-home/` is ignored.
- `bash -n scripts/mimo-watchdog.sh` confirmed watchdog shell syntax is valid.
- `npm run typecheck` passed for server and web.
- `npm run build` passed for web and server production builds.
- `curl -sS http://127.0.0.1:4096/global/health` returned `{"healthy":true,"version":"0.1.4"}`.
- `curl -sS http://127.0.0.1:8090/status` returned WebUI status for `0.0.0.0:8090` with healthy MiMo at `127.0.0.1:4096`.
- `curl -sS -I http://192.168.10.236:8090/` returned `HTTP/1.1 200 OK` and the LAN HTML contained `MiMo Code WebUI` plus built asset references.
- `curl -sS "http://127.0.0.1:8090/api/session?directory=/vol2/1000/下载/mimo/mimo-code-webui"` returned sessions routed to project `c83cca3f-9602-415c-905d-037b84b19037`.

Browser DOM verification was attempted through Playwright but Chromium failed before page load with `chrome_crashpad_handler: --database is required` and `TargetClosedError`. HTTP-level LAN verification passed; browser-level visual/DOM verification remains blocked by the local Chromium crashpad issue.

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [lesson] The dirty worktree contains several unrelated feature lines, so governance should classify before committing rather than forcing one broad change.
- [pivot] The watchdog started as a temporary `pkill -f` script; productization changed it to PID-file ownership to avoid killing user-managed processes.
- [lesson] `.mimo-home/` is runtime/cache/database state and should be ignored, not cleaned by deleting local files during治理.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-07-09-complete-project-governance.md` | Implementation plan | Complete |
| `docs/compose/plans/2026-07-09-minimal-project-governance.md` | Earlier cleanup plan | Complete |
| `docs/compose/reports/worktree-state-archive.md` | Worktree archive | Current commit-slice guide |
