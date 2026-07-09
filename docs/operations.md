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

## LAN Access

For LAN access, set `AUTH_TOKEN` before binding to `0.0.0.0`:

```bash
AUTH_TOKEN=replace-with-a-random-token HOST=0.0.0.0 ./scripts/start.sh
```

Unauthenticated LAN mode is only for trusted temporary testing:

```bash
ALLOW_UNAUTHENTICATED_LAN=true HOST=0.0.0.0 ./scripts/start.sh
```
