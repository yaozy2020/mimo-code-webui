# MiMo Code WebUI

Cross-platform web UI for [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code).

## Features

- KimiCode-style single-chat interface: open the page and start typing
- Streaming responses
- Tool permission / question confirmation dialogs
- Build, plan, and compose agent modes from the input bar
- Settings and diagnostics
- Runs on Linux and Windows
- Optional Bearer token authentication
- Authenticated LAN access through the Linux installer or explicit settings

## Architecture

- **Frontend**: React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Node.js + Express
- **Engine**: MiMo-Code `mimo serve` process managed by the backend

## Linux One-Command Install

### Requirements

- Linux with systemd
- Node.js 18+, npm, and the MiMo-Code CLI (`mimo`)
- A release archive, its `.sha256` and `.sig` files, and the independently distributed trusted Ed25519 public key

Extract the release package, then run:

```bash
sudo ./deploy/mimo-code-webui install \
  --archive ./mimo-code-webui-v0.1.0.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub
```

The installer asks whether to use localhost behind Nginx/Caddy/SSH or direct authenticated LAN access. It creates the service user, generates a random token, configures systemd, starts the service, and verifies WebUI and MiMo health.

The project public key is available at `deploy/keys/mimo-code-webui-release.pub`. Verify its SHA-256 fingerprint through an independent channel before trusting it:

```text
4e49ece0fe7f28708821437dd1268e425bca81b2418ea8fd195cce74fe5b43f8
```

You can verify a downloaded archive without installing it:

```bash
sudo ./deploy/mimo-code-webui verify-archive \
  --archive ./mimo-code-webui-v0.1.0.tar.gz \
  --public-key ./deploy/keys/mimo-code-webui-release.pub
```

For unattended installation:

```bash
sudo ./deploy/mimo-code-webui install \
  --non-interactive --yes \
  --archive ./mimo-code-webui-v0.1.0.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub \
  --mode reverse-proxy
```

See `docs/deployment.md` for LAN mode, upgrades, rollback, status, uninstall, and optional reverse proxies.

## Portable Release Start

For a temporary foreground process rather than a managed Linux service, extract the release and run `./scripts/start.sh` on Linux or `scripts\start.bat` on Windows.

Use `.env.example` as the production environment variable template.

## Quick Start From Source

```bash
npm install
npm run build
npm start
```

Then open http://localhost:8080 in your browser. If port 8080 is already in use, the server will automatically try 8081, 8082, and so on.

## Start Scripts

### Linux

```bash
./scripts/start.sh
```

### Windows

```batch
scripts\start.bat
```

### LAN Access

The backend binds to `127.0.0.1` by default. To reach the WebUI from other devices on the same network, bind to `0.0.0.0` and set `AUTH_TOKEN`:

```bash
AUTH_TOKEN=replace-with-a-random-token HOST=0.0.0.0 ./scripts/start.sh
```

Unauthenticated LAN mode is only for trusted temporary testing:

```bash
ALLOW_UNAUTHENTICATED_LAN=true HOST=0.0.0.0 ./scripts/start.sh
```

```bash
# On the server, find your LAN IP first
hostname -I

# Then from another device open
# http://<server-ip>:8080
```

### Optional Authentication

To require a Bearer token for all API calls, set the `AUTH_TOKEN` environment variable when starting:

```bash
# Linux
AUTH_TOKEN=your-secret-token ./scripts/start.sh

# Windows (PowerShell)
$env:AUTH_TOKEN="your-secret-token"; .\scripts\start.bat

# Windows (CMD)
set AUTH_TOKEN=your-secret-token
scripts\start.bat
```

When `AUTH_TOKEN` is set, the frontend will prompt for the token on first use. You can also enter or update it later in the Settings panel.

## Development

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser. The frontend dev server proxies API calls to the backend on http://localhost:8080.

## Build

```bash
npm run build
npm start
```

Then open http://localhost:8080.

## Configuration

API Key, Base URL, Model, and WebUI Auth Token can be configured in the Settings panel. They are saved to browser localStorage.

- Leave **API Key** empty to use MiMo Code's built-in default model (no login required).
- Set **Model** to `mimo-auto` to let MiMo choose, or use a specific model like `mimo-v2.5`, `claude-3-5-sonnet`, etc.
- **Base URL** and **API Key** are only needed when you want to use a custom or third-party provider.

### Server Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Address the Express backend binds to. Use `0.0.0.0` for LAN access with `AUTH_TOKEN` set. |
| `PORT` | `8080` | Port the WebUI backend listens on. If not set and 8080 is in use, the server automatically finds the next available port. If explicitly set and in use, the server exits with an error. |
| `MIMO_HOST` | `127.0.0.1` | Address the managed `mimo serve` process binds to. Only the backend talks to it; keep it on localhost unless you know what you are doing. |
| `MIMO_PORT` | `4096` | Port the managed `mimo serve` process listens on. |
| `AUTH_TOKEN` | *(none)* | If set, all `/api/*` requests must include `Authorization: Bearer <AUTH_TOKEN>`. |

The primary MiMo config path is `~/.config/mimocode/config.json`. On startup, the WebUI migrates a readable legacy `~/.mimo/mimo.config.json` into the primary path only when the primary path is missing or empty. See `docs/operations.md` for runtime configuration and migration details.

The WebUI backend is the only supported supervisor for `mimo serve`. Do not run a second watchdog or pre-start an unmanaged MiMo process for normal deployment.

## Operations

Production safeguards include:

- Ed25519 publisher signatures, outer SHA-256 verification, and an inner file manifest
- Offline backups before release changes, shared deployment locking, and verified retention pruning
- Immutable releases, health-based automatic rollback, and explicit rollback
- Authenticated operational status while keeping the public health endpoint minimal
- systemd `OnFailure` Webhook alerts for the main and scheduled backup services
- Fixed-memory streaming hashes for large backup files

The default backup retention is seven verified snapshots. Plan non-compressed backup capacity using `(retention + 2) × protected data size`.

See `docs/operations.md` for runtime requirements, restore drills, alert configuration, capacity guidance, ports, and release gates.

See `docs/deployment.md` for non-Docker production deployment with systemd and optional Nginx or Caddy reverse proxy.

Example deployment files live under `deploy/`:

- `deploy/systemd/mimo-code-webui.service`
- `deploy/systemd/mimo-code-webui-backup.service`
- `deploy/systemd/mimo-code-webui-backup.timer`
- `deploy/systemd/mimo-code-webui-alert@.service`
- `deploy/nginx/mimo-code-webui.conf`
- `deploy/caddy/Caddyfile`

## More Documentation

- `docs/operations.md` covers runtime configuration, auth, ports, and troubleshooting.
- `docs/deployment.md` covers release-package deployment, systemd, reverse proxy setup, upgrades, and rollback.
- `docs/testing.md` covers verification commands.
- `docs/architecture.md` explains the frontend/backend/MiMo process boundaries.

## License

MIT
