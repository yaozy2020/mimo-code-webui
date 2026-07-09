# Complete Project Governance Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/complete-project-governance.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current dirty WebUI workspace into a governed, reviewable, and reproducible project state without silently discarding work.

**Architecture:** Treat governance as a sequence of small, independently verifiable cleanup slices. Keep source behavior intact unless a slice explicitly productizes an existing runtime artifact, and record every decision in `docs/compose/reports` so later commits can be split cleanly.

**Tech Stack:** npm workspaces, React 18, TypeScript, Vite, Express, Bash scripts, MiMo Code CLI.

## Global Constraints

- Do not revert, delete, or overwrite existing dirty worktree changes unless the user explicitly requests it.
- Do not commit unless the user explicitly asks for a commit.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm commands in this environment.
- Use existing verification gates: `npm run typecheck` and `npm run build`; there is no repo-level test or lint script.
- Keep `.mimo-home/` ignored and never commit its local runtime/cache/database contents.
- Productized scripts must avoid broad process-kill behavior and should only manage processes they started.

---

## File Structure

- `.gitignore`: owns repository ignore hygiene for local runtime state.
- `scripts/mimo-watchdog.sh`: optional operational fallback script for keeping one `mimo serve` instance alive.
- `README.md`: user-facing runtime and script documentation.
- `docs/compose/reports/worktree-state-archive.md`: current dirty-worktree classification and commit-slice guidance.
- `docs/compose/reports/minimal-project-governance.md`: already records the first cleanup slice.
- `docs/compose/plans/2026-07-09-complete-project-governance.md`: this execution plan.

---

### Task 1: Repository Hygiene And Runtime-State Ignore

**Files:**
- Modify: `.gitignore`
- Modify: `docs/compose/reports/worktree-state-archive.md`

**Interfaces:**
- Consumes: current untracked `.mimo-home/` runtime tree.
- Produces: `.mimo-home/` no longer appears in normal `git status --short` output.

- [x] **Step 1: Verify `.mimo-home/` was visible before ignore cleanup**

Run: `git status --short`

Expected before cleanup: output includes `?? .mimo-home/`.

- [x] **Step 2: Add `.mimo-home/` to `.gitignore`**

Add under the existing MiMo section:

```gitignore
# MiMo
.mimocode/
.mimo-home/
```

- [x] **Step 3: Update the worktree archive**

Update `docs/compose/reports/worktree-state-archive.md` to say `.mimo-home/` is now ignored and must not be committed.

- [x] **Step 4: Verify ignore behavior**

Run: `git check-ignore -q .mimo-home`

Expected: exit code 0.

- [x] **Step 5: Verify status cleanup and TypeScript gate**

Run: `git status --short`

Expected: `.mimo-home/` no longer appears.

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck`

Expected: server and web type checks pass.

---

### Task 2: Productize MiMo Watchdog Script

**Files:**
- Modify: `scripts/mimo-watchdog.sh`
- Modify: `README.md`
- Modify: `docs/compose/reports/worktree-state-archive.md`

**Interfaces:**
- Consumes: existing untracked `scripts/mimo-watchdog.sh` fallback script.
- Produces: a documented, safer manual watchdog script that manages only the process recorded in its own PID file.

- [x] **Step 1: Replace broad process killing with PID-file ownership**

Rewrite `scripts/mimo-watchdog.sh` so it:

```bash
PID_FILE="${WATCHDOG_PID_FILE:-/tmp/mimo-watchdog-${PORT}.pid}"
```

and uses `kill "$pid"` only when `pid` came from that PID file and the process is still alive.

- [x] **Step 2: Preserve explicit runtime configuration**

Keep defaults compatible with current deployment:

```bash
export HOME="${HOME:-/home/yzy}"
export MIMO_CONFIG_PATH="${MIMO_CONFIG_PATH:-/home/yzy/.config/mimocode/config.json}"
HOST="${MIMO_HOST:-127.0.0.1}"
PORT="${MIMO_PORT:-4096}"
INTERVAL="${WATCHDOG_INTERVAL_SEC:-5}"
LOG_FILE="${WATCHDOG_LOG:-/tmp/mimo-watchdog.log}"
```

- [x] **Step 3: Document manual fallback usage**

Add a README section explaining that the primary path is the WebUI backend's built-in health monitor, and the watchdog is only for deployments where WebUI cannot be restarted yet.

- [x] **Step 4: Update archive classification**

Move `scripts/mimo-watchdog.sh` from temporary/untracked risk to productized operational fallback in `worktree-state-archive.md`.

- [x] **Step 5: Verify shell syntax and project typecheck**

Run: `bash -n scripts/mimo-watchdog.sh`

Expected: exit code 0.

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck`

Expected: server and web type checks pass.

---

### Task 3: Commit-Slice Readiness Report

**Files:**
- Modify: `docs/compose/reports/worktree-state-archive.md`

**Interfaces:**
- Consumes: current dirty worktree classification.
- Produces: an explicit ordered checklist for future commits without staging anything.

- [x] **Step 1: Re-run final worktree status**

Run: `git status --short`

Expected: `.mimo-home/` absent; remaining untracked paths are governance docs and productized watchdog unless later staged by a human.

- [x] **Step 2: Update recommended commit slices**

Ensure the archive lists these slices in order:

```text
1. Governance hygiene
2. Runtime/backend management
3. Model routing/settings
4. Workspace/session UI
5. Message/file visual polish
6. Final LAN/runtime verification
```

- [x] **Step 3: Run final verification gates**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

Expected: both commands pass.

- [x] **Step 4: Report remaining unresolved decisions**

Document unresolved work that still needs human choice: whether to commit slices, whether to run LAN verification, and whether to continue into roadmap stability fixes.
