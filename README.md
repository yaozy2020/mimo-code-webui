# MiMo Code WebUI

Cross-platform web UI for [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code).

## Features

- Streaming chat with build, plan, and compose modes
- Active native sessions restore their running state after a page refresh
- Send follow-up prompts while a native MiMo session is running
- Cancel the active task with the square control or `Esc`
- Permission and question dialogs, settings, diagnostics, session diffs, and task status
- Linux systemd deployment, Windows and Linux foreground startup, and optional Bearer-token authentication

## Architecture

- **Frontend**: React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Node.js + Express
- **Engine**: MiMo-Code `mimo serve` process managed by the backend

## Install A Signed Release

The supported production path is Linux with systemd. You need Node.js 18+, npm, MiMo-Code CLI 0.1.5+, OpenSSL 3.x, and these independently obtained files:

- `mimo-code-webui-v0.1.2.tar.gz`
- `mimo-code-webui-v0.1.2.tar.gz.sha256`
- `mimo-code-webui-v0.1.2.tar.gz.sig`
- The trusted Ed25519 public key

Verify the archive before installation:

```bash
sha256sum -c mimo-code-webui-v0.1.2.tar.gz.sha256

openssl pkeyutl -verify \
  -pubin \
  -inkey mimo-code-webui-release.pub \
  -rawin \
  -in mimo-code-webui-v0.1.2.tar.gz \
  -sigfile mimo-code-webui-v0.1.2.tar.gz.sig
```

Extract the archive, then install it:

```bash
sudo ./deploy/mimo-code-webui install \
  --archive ./mimo-code-webui-v0.1.2.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub
```

The installer creates the service user, persistent configuration and state directories, a random API token, and a systemd service. It supports localhost behind a reverse proxy or direct authenticated LAN access. Installation succeeds only when both WebUI and MiMo health checks pass.

The project public key is included at `deploy/keys/mimo-code-webui-release.pub`. Verify this fingerprint through an independent channel before trusting it:

```text
4e49ece0fe7f28708821437dd1268e425bca81b2418ea8fd195cce74fe5b43f8
```

For unattended reverse-proxy installation:

```bash
sudo ./deploy/mimo-code-webui install \
  --non-interactive --yes \
  --archive ./mimo-code-webui-v0.1.2.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub \
  --mode reverse-proxy
```

Use the installer to verify an archive without installing it:

```bash
sudo ./deploy/mimo-code-webui verify-archive \
  --archive ./mimo-code-webui-v0.1.2.tar.gz \
  --public-key ./deploy/keys/mimo-code-webui-release.pub
```

The production installer rejects unsigned artifacts. Formal packages are built from a clean, tagged `main` commit with a protected repository-external signing key. See [docs/deployment.md](docs/deployment.md) for formal packaging, LAN mode, upgrades, rollback, backups, uninstall, and reverse proxies.

## Run From Source

Install dependencies, build both workspaces, and start the backend:

```bash
npm install
npm run build
npm start
```

Open `http://localhost:8080`. When `PORT` is not set and 8080 is busy, the backend tries higher ports.

For a foreground release process, extract the archive and run `./scripts/start.sh` on Linux or `scripts\start.bat` on Windows. Use `.env.example` as the production environment template.

## Configuration

- WebUI settings such as API key, base URL, model, theme, and API token are stored in browser `localStorage`.
- Leave the API key empty to use MiMo-Code's default model, or configure a specific provider/model in Settings.
- Set `AUTH_TOKEN` to protect `/api/*`; the browser prompts for it on first use.
- The primary MiMo configuration is `~/.config/mimocode/config.json`. A readable legacy `~/.mimo/mimo.config.json` is migrated only when the primary file is missing or empty.

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | WebUI backend address. Use `0.0.0.0` only with `AUTH_TOKEN` for LAN access. |
| `PORT` | `8080` | WebUI backend port. |
| `MIMO_HOST` | `127.0.0.1` | Managed MiMo server address. |
| `MIMO_PORT` | `4096` | Managed MiMo server port. |
| `AUTH_TOKEN` | *(none)* | Bearer token required for `/api/*` when set. |

See [docs/operations.md](docs/operations.md) for service paths, production startup, alerts, backup policy, data ownership, and process supervision.

## Development

Run both development servers:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`; Vite proxies API requests to the backend at `http://127.0.0.1:8080`.

Run the release verification suite before packaging or deployment:

```bash
./scripts/verify-release.sh
```

## Operations

Production releases have a detached Ed25519 signature, outer SHA-256 checksum, and inner per-file manifest. Upgrades create an offline backup before switching immutable release directories and roll back automatically when health checks fail. The service manages `mimo serve`; do not run a second watchdog or an unmanaged instance for normal deployment.

## Documentation

- [Deployment guide](docs/deployment.md): signed packages, systemd installation, LAN, upgrades, backups, rollback, and reverse proxies.
- [Operations guide](docs/operations.md): runtime configuration, alerts, data recovery boundaries, and MiMo ownership.
- [Testing guide](docs/testing.md): verification commands and release checks.
- [Architecture guide](docs/architecture.md): frontend, backend, and MiMo process boundaries.

## License

MIT
