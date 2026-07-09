# Non-Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add traditional server deployment assets for running MiMo Code WebUI without Docker.

**Architecture:** Keep runtime behavior unchanged. Provide copyable service and reverse-proxy examples plus a deployment guide that uses the existing release package and `scripts/start.sh` entrypoint.

**Tech Stack:** Node.js/npm, bash start script, systemd, Nginx, Caddy.

## Global Constraints

- Do not change application runtime behavior.
- Do not add Docker assets.
- Keep deployment examples generic and editable by operators.
- Use existing environment variables: `HOST`, `PORT`, `MIMO_HOST`, `MIMO_PORT`, `AUTH_TOKEN`, `MIMO_CONFIG_PATH`, `MIMO_HOME`, `MIMO_WORKSPACE_ROOT`, `MIMO_DATA_HOME`, `MIMO_STATE_HOME`.

---

### Task 1: Add Non-Docker Deployment Assets

**Files:**
- Create: `deploy/systemd/mimo-code-webui.service`
- Create: `deploy/nginx/mimo-code-webui.conf`
- Create: `deploy/caddy/Caddyfile`
- Create: `docs/deployment.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing `scripts/start.sh`, release tarball from `npm run package:release`, runtime environment variables.
- Produces: operator-facing deployment path for release package, systemd, Nginx, and Caddy.

- [x] **Step 1: Add service and reverse-proxy examples**

Create systemd, Nginx, and Caddy examples that point at `/opt/mimo-code-webui/current` and proxy to `127.0.0.1:8080`.

- [x] **Step 2: Add deployment guide**

Document requirements, install, configuration, systemd setup, reverse proxy setup, upgrade, logs, and troubleshooting.

- [x] **Step 3: Update README**

Add links from quick start and documentation sections to `docs/deployment.md` and the deploy examples.

- [x] **Step 4: Verify docs and packaging**

Run `npm run verify` and `npm run package:release`; inspect release tarball if packaging changed.
