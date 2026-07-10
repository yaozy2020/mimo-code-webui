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

Set `MIMO_WEBUI_STRICT_RELEASE=true` in production. Strict release mode requires `node_modules`, `web/node_modules`, `server/node_modules`, `web/dist`, and `server/dist` to exist before startup. Missing artifacts fail fast so production servers do not install dependencies or build assets during service start.

## Request IDs

Every HTTP response includes `X-Request-ID`. If a reverse proxy supplies `X-Request-ID`, the server preserves it; otherwise the server generates one. Use this value to correlate client errors with server logs.

## LAN Access

For LAN access, set `AUTH_TOKEN` before binding to `0.0.0.0`:

```bash
AUTH_TOKEN=replace-with-a-random-token HOST=0.0.0.0 ./scripts/start.sh
```

Unauthenticated LAN mode is only for trusted temporary testing:

```bash
ALLOW_UNAUTHENTICATED_LAN=true HOST=0.0.0.0 ./scripts/start.sh
```

## 5.6 Runtime Compatibility

In this audit session, 5.6 background actors returned `idle`, `turnCount: 0`, and no output immediately after spawn. Treat 5.6 as untrusted for compose/subagent/background actor workflows until actor result delivery is verified.

Use this rollout rule:

- Direct single-agent chat may use 5.6 after a direct prompt smoke test returns non-empty output.
- Tool-use workflows may use 5.6 after a tool call smoke test returns expected output.
- Compose, subagent, and background actor workflows must stay on a known-stable model until a background actor smoke returns `turnCount > 0` and final output containing `READY` twice consecutively.

Manual smoke prompt:

```text
spawn a background actor that returns the string READY
```

Optional local command smoke:

```bash
MODEL_RUNTIME_SMOKE_55='mimo run --model libwrt/gpt-5.5 READY' \
MODEL_RUNTIME_SMOKE_56='mimo run --model libwrt/gpt-5.6 READY' \
npm run smoke:model-runtime
```

The command smoke only verifies direct command output. Background actor workflows still require the manual actor delivery check above.
