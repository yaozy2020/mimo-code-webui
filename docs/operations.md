# Operations

## Runtime Requirements

- Node.js 18+
- npm
- MiMo Code CLI available as `mimo` on `PATH`

## Configuration Paths

The primary MiMo config path is `~/.config/mimocode/config.json`.

On startup, the server migrates a readable legacy `~/.mimo/mimo.config.json` into the primary path only when the primary path is missing or empty.

Use `MIMO_CONFIG_PATH=/path/to/config.json` to override the config file.
Use `MIMO_HOME=/path/to/home` only when a service account intentionally needs a different MiMo home directory.

## Ports

The WebUI backend defaults to `HOST=127.0.0.1` and `PORT=8080`.
The managed MiMo serve process defaults to `MIMO_HOST=127.0.0.1` and `MIMO_PORT=4096`.

## Release Gate

Run the local release gate before packaging or deploying:

```bash
./scripts/verify-release.sh
```

Set `VERIFY_RELEASE_CI_INSTALL=true` when you want the gate to start from `npm ci` instead of the current `node_modules` tree:

```bash
VERIFY_RELEASE_CI_INSTALL=true ./scripts/verify-release.sh
```

This gate is intentionally local/self-hosted friendly and does not require GitHub Actions minutes. If hosted CI quota becomes available later, call the same script from CI rather than duplicating the command list.

## Production Startup

Set `MIMO_WEBUI_STRICT_RELEASE=true` in production. Strict release mode requires the built frontend/backend entrypoints and resolvable production dependencies. It never installs dependencies or builds assets during service start; npm workspace dependencies may be hoisted to the root `node_modules`.

## Request IDs

Every HTTP response includes `X-Request-ID`. If a reverse proxy supplies `X-Request-ID`, the server preserves it; otherwise the server generates one. Use this value to correlate client errors with server logs.

Server request and route-error logs are emitted as one-line JSON with an event name, request ID, status, and duration where applicable. Authenticated `/local-status` includes MiMo supervisor state, restart count, consecutive failures, last restart time and reason, last healthy time, and startup duration. Public `/status` intentionally omits these operational details.

## LAN Access

For LAN access, set `AUTH_TOKEN` before binding to `0.0.0.0`:

```bash
AUTH_TOKEN=replace-with-a-random-token HOST=0.0.0.0 ./scripts/start.sh
```

Unauthenticated LAN mode is only for trusted temporary testing:

```bash
ALLOW_UNAUTHENTICATED_LAN=true HOST=0.0.0.0 ./scripts/start.sh
```

## Managed Deployment

Use the deployment CLI for service status and release information:

```bash
sudo /opt/mimo-code-webui/current/deploy/mimo-code-webui status
sudo journalctl -u mimo-code-webui -f
```

Runtime state is separated from releases:

- `/etc/mimo-code-webui/webui.env`: administrator configuration and `AUTH_TOKEN`.
- `/var/lib/mimo-code-webui`: service home plus MiMo data/state.
- `/srv/mimo-code-workspaces`: default workspace root; uninstall never deletes it.
- Browser `localStorage`: per-browser preferences and entered token; it is not part of server backups.

Back up `/etc/mimo-code-webui` and `/var/lib/mimo-code-webui` before host migration. To rotate authentication, update `AUTH_TOKEN`, restart the service, and enter the new token in each browser.

Failed upgrades retain the failed release for diagnosis and automatically restore the previous healthy `current` symlink.

## Data Ownership And Recovery

MiMo Code owns its SQLite database, memory Markdown, session history, and snapshots. WebUI release rollback changes application code only; it does not restore or merge MiMo data.

Do not delete `mimocode.db-wal` or `mimocode.db-shm` while MiMo may be running. Incident-specific database recovery scripts are intentionally kept outside the product repository and release packages. Recovery requires an offline, verified backup and an explicit operations runbook.

### Backup health

When explicitly installed and enabled, `mimo-code-webui-backup.timer` runs a daily offline snapshot with randomized delay. The oneshot stops WebUI and its managed MiMo process, writes a manifest-backed snapshot, and starts WebUI again even when backup fails. Deployments that reuse an externally owned MiMo process must not enable this timer until that owner provides an equivalent stop-the-writer boundary. Check `systemctl status mimo-code-webui-backup.timer`, `journalctl -u mimo-code-webui-backup.service`, and authenticated `/local-status` for `backup.state`.

Backups older than `MIMO_BACKUP_MAX_AGE_MS` are reported as degraded. A failed attempt never deletes the previous valid backup. Before restoring, run `node scripts/backup-state.mjs verify BACKUP_DIRECTORY` in an isolated host, then validate SQLite integrity and application-level reads before replacing production data. Program rollback and data restore are always separate operator actions.

For an isolated restore drill, run `node scripts/backup-state.mjs restore BACKUP_DIRECTORY EMPTY_DESTINATION`. The command refuses non-empty destinations and writes `restore-report.json` with the backup ID, file count, and measured restore duration. Validate the restored database and application behavior in that isolated destination; do not use this command to overwrite live state.

### MiMo process ownership

WebUI starts and owns its MiMo processes by default. It does not attach to a healthy process merely because a nearby port responds. Set `MIMO_REUSE_EXISTING=true` only when the process on the configured `MIMO_PORT` is intentionally shared and its `/path.directory` matches `MIMO_SERVE_CWD`; an explicit port never scans higher ports for a replacement.

Requests carrying a validated `directory` query parameter use a dedicated managed MiMo instance for that workspace. Concurrent requests for the same directory share one startup; different directories use different ports. Graceful WebUI shutdown waits for base, running workspace, and still-starting workspace processes to exit before completing.
