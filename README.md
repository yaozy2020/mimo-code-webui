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

## Quick Start

### Requirements

- Node.js 18+
- MiMo-Code CLI (`mimo`) installed

### Linux

```bash
./scripts/start.sh
```

### Windows

```batch
scripts\start.bat
```

Then open http://localhost:8080 in your browser. If port 8080 is already in use, the server will automatically try 8081, 8082, and so on.

### LAN Access

The backend binds to `0.0.0.0` by default, so the WebUI is also reachable from other devices on the same network via the server's IP address:

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
| `HOST` | `0.0.0.0` | Address the Express backend binds to. Use `127.0.0.1` to restrict to localhost. |
| `PORT` | `8080` | Port the WebUI backend listens on. If not set and 8080 is in use, the server automatically finds the next available port. If explicitly set and in use, the server exits with an error. |
| `MIMO_HOST` | `127.0.0.1` | Address the managed `mimo serve` process binds to. Only the backend talks to it; keep it on localhost unless you know what you are doing. |
| `MIMO_PORT` | `4096` | Port the managed `mimo serve` process listens on. |
| `AUTH_TOKEN` | *(none)* | If set, all `/api/*` requests must include `Authorization: Bearer <AUTH_TOKEN>`. |

You can also pre-configure MiMo-Code via `~/.mimo/mimo.config.json`:

```json
{
  "apiKey": "YOUR_MIMO_API_KEY",
  "baseUrl": "https://token-plan-sgp.xiaomimimo.com/anthropic"
}
```

## License

MIT
