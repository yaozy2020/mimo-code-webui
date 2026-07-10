# Non-Docker Deployment

This guide deploys MiMo Code WebUI on a traditional Linux server without Docker. It uses the release package, `scripts/start.sh`, systemd, and an optional reverse proxy.

## Requirements

- Linux server with Node.js 18+ and npm
- MiMo-Code CLI available as `mimo` on `PATH`
- A readable MiMo config, normally `~/.config/mimocode/config.json`
- A service user that can read the MiMo config and workspace directories

## Directory Layout

The examples use this layout:

```text
/opt/mimo-code-webui/
  releases/
    mimo-code-webui-v0.1.0/
  current -> /opt/mimo-code-webui/releases/mimo-code-webui-v0.1.0
/etc/mimo-code-webui/webui.env
```

You can use a different path, but update the systemd service accordingly.

## Install From Release Package

Create a service user and install the release package:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin mimo-webui
sudo mkdir -p /opt/mimo-code-webui/releases /etc/mimo-code-webui
sudo tar -xzf mimo-code-webui-v0.1.0.tar.gz -C /opt/mimo-code-webui/releases
sudo ln -sfn /opt/mimo-code-webui/releases/mimo-code-webui-v0.1.0 /opt/mimo-code-webui/current
sudo chown -R mimo-webui:mimo-webui /opt/mimo-code-webui
```

Install production dependencies:

```bash
cd /opt/mimo-code-webui/current
sudo -u mimo-webui npm install --omit=dev
```

If the release package already includes `web/dist` and `server/dist`, `scripts/start.sh` will use them. If either build output is missing, the script will run `npm run build` before starting.

## Configure Environment

Create `/etc/mimo-code-webui/webui.env`:

```bash
sudo install -d -m 750 -o root -g mimo-webui /etc/mimo-code-webui
sudo tee /etc/mimo-code-webui/webui.env >/dev/null <<'EOF'
HOST=127.0.0.1
PORT=8080
MIMO_HOST=127.0.0.1
MIMO_PORT=4096
AUTH_TOKEN=replace-with-a-long-random-token
MIMO_CONFIG_PATH=/home/mimo-webui/.config/mimocode/config.json
MIMO_WORKSPACE_ROOT=/srv/workspaces
MIMO_SERVE_CWD=/srv/workspaces
MIMO_WEBUI_STRICT_RELEASE=true
EOF
sudo chmod 640 /etc/mimo-code-webui/webui.env
```

The release package also includes `.env.example` with the same variables as a quick reference.

Notes:

- Keep `HOST=127.0.0.1` when using Nginx or Caddy on the same machine.
- Use `HOST=0.0.0.0` only for direct LAN access, and keep `AUTH_TOKEN` set.
- Set `MIMO_HOME=/path/to/home` only when the service must use a different home directory for MiMo config and state.
- Set `MIMO_DATA_HOME` and `MIMO_STATE_HOME` only when the service account cannot write to its default XDG data/state paths.
- Set `MIMO_WORKSPACE_ROOT` to the parent directory that WebUI sessions are allowed to use.
- Set `MIMO_SERVE_CWD` to the directory where the base `mimo serve` process should start. It is usually the same as `MIMO_WORKSPACE_ROOT`, but source checkouts may intentionally use `MIMO_WORKSPACE_ROOT=/` with a narrower `MIMO_SERVE_CWD`.
- Keep `MIMO_WEBUI_STRICT_RELEASE=true` for production releases so startup fails fast if dependencies or build output are missing.

Make sure the service user can read the MiMo config and workspace root:

```bash
sudo -u mimo-webui test -r /home/mimo-webui/.config/mimocode/config.json
sudo -u mimo-webui test -d /srv/workspaces
```

## Run With systemd

Install the service file:

```bash
sudo cp deploy/systemd/mimo-code-webui.service /etc/systemd/system/mimo-code-webui.service
sudo systemctl daemon-reload
sudo systemctl enable --now mimo-code-webui
```

Check status and logs:

```bash
sudo systemctl status mimo-code-webui
sudo journalctl -u mimo-code-webui -f
```

The service runs `scripts/start.sh`, which checks Node/npm and starts `server/dist/index.js`. In strict release mode, missing dependencies or build output cause startup to fail instead of running install/build on the server.

## Reverse Proxy

Reverse proxying is optional but recommended for public or LAN deployments because it gives you stable hostnames and HTTPS.

### Nginx

Copy and edit the example:

```bash
sudo cp deploy/nginx/mimo-code-webui.conf /etc/nginx/sites-available/mimo-code-webui.conf
sudo editor /etc/nginx/sites-available/mimo-code-webui.conf
sudo ln -sfn /etc/nginx/sites-available/mimo-code-webui.conf /etc/nginx/sites-enabled/mimo-code-webui.conf
sudo nginx -t
sudo systemctl reload nginx
```

The example proxies to `http://127.0.0.1:8080`, preserves upgrade headers, disables buffering, and uses long read/write timeouts for streaming responses.

### Caddy

Copy the example into your Caddy configuration and replace `mimo.example.com`:

```bash
sudo editor /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy manages HTTPS automatically when DNS points at the server.

## Direct LAN Access

If you do not use a reverse proxy, bind directly to the LAN interface:

```bash
HOST=0.0.0.0 PORT=8080 AUTH_TOKEN=replace-with-a-long-random-token ./scripts/start.sh
```

Open `http://<server-ip>:8080` from another device. Do not expose direct LAN mode without `AUTH_TOKEN` except for temporary trusted testing.

## Source Checkout On Local Servers

For a source checkout, prefer the diagnostic wrapper instead of hand-written
`kill` and `npm start` commands:

```bash
cd /path/to/mimo-code-webui
AUTH_TOKEN=replace-with-a-long-random-token ./scripts/run-source.sh --restart --daemon
```

The wrapper keeps the two directory concepts separate:

- `MIMO_WORKSPACE_ROOT` controls which workspace directories WebUI accepts. The source wrapper defaults it to the parent of the WebUI repository.
- `MIMO_SERVE_CWD` controls where the base `mimo serve` process is launched. The source wrapper defaults it to the parent of the WebUI repository. Override it when MiMo-Code should serve a broader workspace root.

For direct LAN access without a reverse proxy, opt in explicitly:

```bash
HOST=0.0.0.0 PORT=8090 AUTH_TOKEN=replace-with-a-long-random-token ./scripts/run-source.sh --restart --daemon
```

If old MiMo config files shadow the intended `~/.config/mimocode/mimocode.jsonc`, clean only the known generated/legacy files before startup:

```bash
AUTH_TOKEN=replace-with-a-long-random-token ./scripts/run-source.sh --restart --clean-poisoned-config
```

The wrapper removes `~/.mimo/mimo.config.json` and `~/.config/mimocode/config.json` only when `--clean-poisoned-config` is passed. It leaves `~/.config/mimocode/mimocode.jsonc` untouched.
When `MIMO_CONFIG_PATH` is not already set and `~/.config/mimocode/mimocode.jsonc` exists, the wrapper points WebUI and `mimo serve` at that file so `scripts/start.sh` does not recreate `config.json` as the default config source.

Use `--recover` only for explicit local break/fix recovery. It combines `--restart`, `--clean-poisoned-config`, `--clean-db-locks`, and `--daemon`, then returns after `/status` is healthy. WebUI logs are written to `/tmp/mimo-webui.log`.

If your host needs a wider workspace root, set it explicitly instead of relying on broad defaults:

```bash
MIMO_WORKSPACE_ROOT=/srv MIMO_SERVE_CWD=/srv/workspaces AUTH_TOKEN=replace-with-a-long-random-token ./scripts/run-source.sh --restart --daemon
```

Avoid using `MIMO_WORKSPACE_ROOT=/` unless the machine is trusted and you intentionally want WebUI sessions to browse the whole filesystem.

Keep one deployment user for the checkout, build output, `node_modules`, and runtime process. A typical failure mode is building as one user and starting as another, which can make models disappear or leave sessions blank because the runtime cannot read config, build output, or workspace directories.

## Upgrade

Install the new release beside the old one, then move the `current` symlink:

```bash
sudo tar -xzf mimo-code-webui-v0.1.1.tar.gz -C /opt/mimo-code-webui/releases
cd /opt/mimo-code-webui/releases/mimo-code-webui-v0.1.1
sudo -u mimo-webui npm install --omit=dev
sudo ln -sfn /opt/mimo-code-webui/releases/mimo-code-webui-v0.1.1 /opt/mimo-code-webui/current
sudo systemctl restart mimo-code-webui
```

Rollback is the same operation with the previous release path:

```bash
sudo ln -sfn /opt/mimo-code-webui/releases/mimo-code-webui-v0.1.0 /opt/mimo-code-webui/current
sudo systemctl restart mimo-code-webui
```

## Verification

After deployment, verify the public status route:

```bash
curl -fsS http://127.0.0.1:8080/status
```

If `AUTH_TOKEN` is set, verify an authenticated API request through the frontend or with a bearer token:

```bash
curl -fsS -H "Authorization: Bearer $AUTH_TOKEN" http://127.0.0.1:8080/api/config
```

For source checkouts before packaging, run:

```bash
./scripts/verify-release.sh
npm run package:release
```

## Troubleshooting

- `Error: Node.js is not installed or not in PATH.`: install Node.js 18+ or adjust the service `PATH`.
- `npm is not available in PATH`: install npm for the Node.js version used by the service.
- `/status` is reachable but chat requests fail: check `mimo --version`, `MIMO_CONFIG_PATH`, and `journalctl -u mimo-code-webui` for MiMo startup errors.
- LAN users see the page but API calls fail with 401: enter the same `AUTH_TOKEN` in the WebUI Settings panel.
- Workspace creation is rejected: set `MIMO_WORKSPACE_ROOT` to a parent directory that contains the requested workspace and is readable by the service user.
- Model list is empty after startup: check `/status` for the `mimo.version`, confirm `mimo serve` is not an old process reused on `MIMO_PORT`, and verify the runtime user can read the intended MiMo config.
- `mimo serve` reports `Access denied` when `MIMO_WORKSPACE_ROOT=/`: set `MIMO_SERVE_CWD` to a real parent directory that covers your projects, for example `/vol2/1000/下载`, while leaving `MIMO_WORKSPACE_ROOT=/` if broad WebUI workspace access is required.
