# MiMo Code WebUI

Cross-platform web UI for [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code).

## Features

- KimiCode-style single-chat interface: open the page and start typing
- Streaming responses
- Tool permission / question confirmation dialogs
- Multimodal and web-search modes from the input bar
- Settings and diagnostics
- Runs on Linux and Windows
- Optional Bearer token authentication
- LAN access out of the box

## Architecture

- **Frontend**: React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Node.js + Express
- **Engine**: MiMo-Code `mimo serve` process managed by the backend

## Quick Start From Release Package

### Requirements

- Node.js 18+
- MiMo-Code CLI (`mimo`) installed

1. Download and extract `mimo-code-webui-v0.1.0.tar.gz`.
2. Start with `./scripts/start.sh` on Linux or `scripts\start.bat` on Windows.
3. Open the printed WebUI URL in your browser.

For long-running Linux server deployment without Docker, see `docs/deployment.md`. It covers release-package installation, systemd, Nginx, Caddy, upgrades, logs, and rollback.

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

### Optional MiMo Watchdog

The WebUI backend already monitors and restarts the base `mimo serve` process when it started that process itself. Use `scripts/mimo-watchdog.sh` only as a manual fallback for deployments where the WebUI server cannot be restarted yet.

```bash
scripts/mimo-watchdog.sh
```

Useful environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MIMO_HOST` | `127.0.0.1` | Hostname for the watched `mimo serve`. |
| `MIMO_PORT` | `4096` | Port for the watched `mimo serve`. |
| `WATCHDOG_INTERVAL_SEC` | `5` | Health-check interval in seconds. |
| `WATCHDOG_LOG` | `/tmp/mimo-watchdog.log` | Log file path. |
| `WATCHDOG_PID_FILE` | `/tmp/mimo-watchdog-<port>.pid` | PID file for the process started by the watchdog. |

The watchdog only stops a process recorded in its own PID file. It does not kill arbitrary `mimo serve` processes on the same port, so a manually started instance remains under your control.

## Operations

See `docs/operations.md` for runtime requirements, config paths, ports, and runtime notes.

See `docs/deployment.md` for non-Docker production deployment with systemd and optional Nginx or Caddy reverse proxy.

Example deployment files live under `deploy/`:

- `deploy/systemd/mimo-code-webui.service`
- `deploy/nginx/mimo-code-webui.conf`
- `deploy/caddy/Caddyfile`

## More Documentation

- `docs/operations.md` covers runtime configuration, auth, ports, and troubleshooting.
- `docs/deployment.md` covers release-package deployment, systemd, reverse proxy setup, upgrades, and rollback.
- `docs/testing.md` covers verification commands.
- `docs/architecture.md` explains the frontend/backend/MiMo process boundaries.

## License

MIT
