# MiMoCode WebUI Multi-workspace Runtime

## Current Model

The WebUI now follows a Kimi-like workspace model:

- The Express backend starts or reuses a default `mimo serve` for baseline APIs.
- When a request includes `?directory=<workspace>`, the backend starts or reuses a dedicated `mimo serve` process whose cwd is that workspace directory.
- Requests for the same workspace reuse the same process.
- The React client stores each session's `directory` and includes it in message, prompt, todo, diff, permission, question, and event-stream requests.
- The active workspace event stream connects to `/api/global/event?directory=<workspace>` so assistant deltas come from the correct `mimo serve` instance.

This avoids widening a single serve instance to `/` and avoids relying on `MIMOCODE_SERVER_PASSWORD` to disable MiMo's directory safety check.

## Startup

Recommended command for the current LAN deployment:

```bash
HOST=0.0.0.0 PORT=8090 PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm start -w server
```

Optional environment variables:

- `MIMO_HOST`: host for the default `mimo serve`, default `127.0.0.1`.
- `MIMO_PORT`: port for the default `mimo serve`, default `4096`.
- `MIMO_WORKSPACE_ROOT`: cwd for the default serve only. Dedicated workspace instances still start from the selected workspace directory.
- `AUTH_TOKEN`: protects `/api/*` and should be used when exposing the WebUI on LAN.

## Workspace Selection

New workspace session flow:

1. User opens `新建工作区会话`.
2. User enters an absolute workspace path.
3. Frontend calls `POST /api/session?directory=<workspace>`.
4. Backend routes the request to an existing instance for that directory, or starts a new `mimo serve` process with `cwd=<workspace>`.
5. The returned session is stored as WebUI-owned and active.

Attach existing session flow:

1. User opens `接入已有会话`.
2. User enters a session ID or browses discovered MiMo sessions.
3. WebUI resolves the session's original `directory`, then stores the session as explicitly attached.
4. Later reads/sends use that stored directory.

## Verified Behavior

Verified on `http://192.168.10.236:8090/`:

- Creating a session in `/vol2/1000/下载/project` sends `POST /api/session?directory=%2Fvol2%2F1000%2F%E4%B8%8B%E8%BD%BD%2Fproject`.
- The backend starts a separate `mimo serve` on `127.0.0.1:4097` while the default instance remains on `127.0.0.1:4096`.
- Browser reload reconnects the active event stream to `/api/global/event?directory=%2Fvol2%2F1000%2F%E4%B8%8B%E8%BD%BD%2Fproject`.
- The session cache stores the active session and workspace directory, so refresh can restore routing.

Verification commands run before commit `a002776`:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w server
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

## Known Gaps

- Workspace instances are visible only through `/status` today; there is no dedicated UI panel yet.
- Instances do not have idle-time auto-cleanup yet.
- Dead instance recovery is minimal; failed requests surface as proxy errors.
- Frontend only streams events from the active workspace. Non-active workspace status still needs polling or backend event aggregation.
- LAN deployments should use `AUTH_TOKEN`; otherwise anyone who can reach the WebUI can ask it to start workspace processes for readable local directories.

## Next Steps

1. Add a backend instance-management API: list instances, health, last used, close by directory.
2. Add a Diagnostics panel section for workspace instances.
3. Add idle cleanup and dead-process restart.
4. Add status polling for non-active sessions.
5. Later, consider backend aggregation of multiple `global/event` streams.
