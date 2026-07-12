# Linux Deployment

The supported production path is the release-package installer on Linux with systemd. It keeps releases immutable, stores configuration and MiMo state outside version directories, verifies health after every switch, and automatically rolls back failed upgrades.

## Requirements

- Linux with systemd and root/sudo access
- Node.js 18+ and npm
- MiMo-Code CLI 0.1.5 or newer available as `mimo` on `PATH`
- Release archive plus the generated `.sha256` and `.sig` sidecars
- A trusted Ed25519 public key obtained independently from the release archive
- OpenSSL 3.x for signature verification

The installer does not install Node.js, MiMo-Code, Nginx, or Caddy.

`0.1.5` is the conservative minimum compatibility preflight because it is the oldest MiMo version for which this repository has recorded end-to-end operational evidence; no reliable evidence supports an older version. Before any backup, service stop, extraction, or release switch, the installer cross-checks `mimo --version` with `/global/health` and runs bounded read-only shape checks against `/global/health`, `/global/path`, and `/config`. `MIMO_PROBE_TIMEOUT` may be set to an integer from 1 through 30 seconds. Unknown or mismatched versions, an old or missing CLI, an unavailable endpoint, or an incompatible response blocks deployment. This is a minimum compatibility preflight, not validation of the complete MiMo protocol, and it never calls `/session`.

The project public key is published at `deploy/keys/mimo-code-webui-release.pub`; verify its independently communicated SHA-256 fingerprint before use. The current fingerprint is `4e49ece0fe7f28708821437dd1268e425bca81b2418ea8fd195cce74fe5b43f8`.

## Install

Extract the release archive and run its installer:

```bash
sudo ./deploy/mimo-code-webui install \
  --archive ./mimo-code-webui-v0.1.1.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub
```

The installer asks you to choose:

1. **Localhost + reverse proxy**: binds `127.0.0.1:8080`. Use this with Nginx, Caddy, or an SSH tunnel.
2. **Direct LAN**: binds `0.0.0.0:8090` and requires the generated authentication token.

It creates the `mimo-webui` service user, persistent directories, environment file, immutable release, systemd unit, and random 32-byte token. Installation succeeds only when `/status` reports `mimo.healthy: true`.

Default layout:

```text
/opt/mimo-code-webui/releases/<version>-<sha-prefix>/
/opt/mimo-code-webui/current
/opt/mimo-code-webui/previous
/etc/mimo-code-webui/webui.env
/var/lib/mimo-code-webui/{home,data,state}/
/srv/mimo-code-workspaces/
```

Read the token without printing it into service logs:

```bash
sudo sed -n 's/^AUTH_TOKEN=//p' /etc/mimo-code-webui/webui.env
```

## Unattended Install

Localhost/reverse-proxy mode:

```bash
sudo ./deploy/mimo-code-webui install \
  --non-interactive --yes \
  --archive ./mimo-code-webui-v0.1.1.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub \
  --mode reverse-proxy
```

Direct LAN mode:

```bash
sudo ./deploy/mimo-code-webui install \
  --non-interactive --yes \
  --archive ./mimo-code-webui-v0.1.1.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub \
  --mode lan \
  --port 8090 \
  --workspace-root /srv/mimo-code-workspaces
```

`--public-key` is mandatory. The installer verifies the detached Ed25519 signature before stopping services, creating an upgrade backup, extracting files, or switching releases. Useful options include `--signature PATH`, `--checksum PATH`, `--sha256 HEX`, `--auth-token TOKEN`, `--mimo-config PATH`, `--mimo-serve-cwd PATH`, `--health-timeout SECONDS`, and `--keep-releases COUNT`. Non-interactive mode never reads stdin and fails when required values are absent.

## Building Release Artifacts

Formal releases are allowed only from the approved `main` branch with a clean tracked tree and an annotated or signed `v<package-version>` tag at `HEAD`. A protected Ed25519 private key with mode `0600` (or stricter) is mandatory; never use the production key for development or tests:

```bash
RELEASE_SIGNING_KEY=/secure/release.key npm run package:release
```

The formal archive, manifest, checksum, and signature bind the exact package version and Git commit. Missing key, branch/tag mismatch, dirty tracked inputs, or metadata mismatch fails closed.

For local development only, build an explicitly unsigned artifact:

```bash
npm run package:unsigned
```

Its archive name contains `.unsigned`, no `.sig` is emitted, and the production installer naturally rejects it because signed publisher authentication is mandatory. It must not be renamed or promoted as a formal release.

## Status And Logs

```bash
sudo /opt/mimo-code-webui/current/deploy/mimo-code-webui status
sudo systemctl status mimo-code-webui
sudo journalctl -u mimo-code-webui -f
```

`status` reports release links, service state, listening address, workspace, and health. It never prints the token.

## Upgrade

Run the installer from the newly extracted release:

```bash
sudo ./deploy/mimo-code-webui upgrade \
  --archive ./mimo-code-webui-v0.1.1.tar.gz \
  --public-key /etc/mimo-code-webui-release.pub
```

The existing `/etc/mimo-code-webui/webui.env` is preserved; upgrade rejects network/configuration flags instead of silently ignoring them. Before the required offline backup can stop anything, upgrade records the selected release and whether the service is active. The old release must return to that prior service state and, when previously active, pass health checks before candidate extraction begins. A failed recovery blocks the upgrade with an explicit compensation result; it does not extract or select the candidate, change the environment or units, or report success.

The new release is installed beside the current version, then `current` is switched atomically. If WebUI or MiMo health fails, the old symlink, previous pointer, and systemd unit are restored and verified before the command returns an error. An active service is restarted for candidate verification. A previously inactive service is temporarily started, checked for WebUI health and the minimum MiMo protocol, stopped, and confirmed inactive; its enabled/disabled policy is preserved. Any failure in that sequence enters full transaction compensation.

`--keep-releases COUNT` is the total number of release directories retained. Distinct `current` and `previous` targets each consume one slot; remaining slots are filled newest-first by modification time. Temporary `.install-*` directories are excluded, and selected releases are never pruned.

## Rollback

Rollback to `previous`:

```bash
sudo /opt/mimo-code-webui/current/deploy/mimo-code-webui rollback
```

Or select an installed directory name from `/opt/mimo-code-webui/releases`:

```bash
sudo /opt/mimo-code-webui/current/deploy/mimo-code-webui rollback \
  --release 0.1.0-0123456789ab
```

Rollback preserves the service state observed when rollback began. Active targets use restart verification. Inactive targets use the same temporary start, health, protocol, stop, and inactive-confirmation sequence as upgrade. A failure restores links, units, enablement, and the original active state.

## Backup Timer

The release includes `deploy/systemd/mimo-code-webui-backup.service` and `.timer`, but the installer does not enable the timer automatically. First confirm this systemd service owns every process that can write MiMo state, confirm `MIMO_REUSE_EXISTING` is not `true`, and ensure `/var/backups/mimo-code-webui` has sufficient protected storage. Then opt in explicitly:

```bash
sudo systemctl enable --now mimo-code-webui-backup.timer
```

The oneshot stops WebUI and its managed MiMo process only when the service was active and `/status` confirms `mimo.healthy === true`, then restores and rechecks that state after success or failure. A service that was inactive is not health-probed, marked, stopped, or started. The mode-0600 JSON marker in a mode-0700 directory records the systemd invocation ID and healthy baseline. Normal `prepare` and `restore` accept only the exact owner ID; foreign or malformed markers fail closed without mutation. A crashed invocation requires the explicit `backup-service-state.sh recover` operator action, which keeps the marker unless start, active-state confirmation, and health all succeed. Scheduled backup refuses before copying or writing status when `MIMO_REUSE_EXISTING=true`; externally managed MiMo deployments need an owner-specific stop-the-writer and backup procedure instead.

If deployment compensation cannot fully restore links, units, enablement, and service state, the mode-0700 transaction snapshot is retained and a mode-0600 `deployment-recovery-required` marker is written under the state root. It contains only recovery paths, link targets, service baselines, and the failed stage, never environment contents or `AUTH_TOKEN`. Later upgrade and rollback commands fail before mutation until an operator restores the snapshot and clears the marker. Successful compensation removes both snapshot and marker.

`upgrade` requires a successful offline backup after archive validation and before changing the installed release. `uninstall --purge` likewise requires a recorded healthy backup. `--break-glass-skip-backup` bypasses either gate only when an operator explicitly accepts the data risk; the command logs a visible `BREAK GLASS` audit line. Neither purge nor backup recursively touches the configured workspace root.

## Uninstall

Remove the service while preserving releases, configuration, MiMo data, and workspaces:

```bash
sudo /opt/mimo-code-webui/current/deploy/mimo-code-webui uninstall
```

Delete WebUI releases, configuration, and WebUI/MiMo state:

```bash
sudo /opt/mimo-code-webui/current/deploy/mimo-code-webui uninstall --purge
```

The workspace root is never deleted. Non-interactive purge requires `--yes`.

## Reverse Proxy

The release contains `deploy/nginx/mimo-code-webui.conf` and `deploy/caddy/Caddyfile`. The installer does not overwrite host proxy configuration.

Nginx example:

```bash
sudo cp deploy/nginx/mimo-code-webui.conf /etc/nginx/sites-available/mimo-code-webui.conf
sudo editor /etc/nginx/sites-available/mimo-code-webui.conf
sudo nginx -t
sudo systemctl reload nginx
```

The template disables proxy buffering and uses long timeouts for SSE streaming. Only deployment at the origin root path `/` is supported; URL subpath hosting is not supported. Use HTTPS outside a trusted LAN.

## Advanced Manual Start

For a temporary foreground process, set variables and run `scripts/start.sh`. It is not a replacement for systemd installation:

```bash
HOST=127.0.0.1 PORT=8080 AUTH_TOKEN=replace-with-a-random-token ./scripts/start.sh
```

`scripts/run-source.sh` is a source-checkout diagnostic helper. It is intentionally excluded from release packages and must not be used as the production service manager or a database recovery tool. It only restarts a WebUI process previously recorded by the same checkout; it never kills unknown port owners or removes SQLite WAL/SHM files. The backend's `MimoSupervisor` owns normal `mimo serve` startup, monitoring, and shutdown.

## Troubleshooting

- **Checksum sidecar not found**: keep the archive and `.sha256` in the same directory, or pass `--checksum`.
- **Node/npm/mimo not found**: install them system-wide or ensure root can resolve their executable paths.
- **Service user cannot read config/workspace**: grant `mimo-webui` read/execute access; the installer never recursively changes an existing workspace owner.
- **Page loads but API returns 401**: enter the token from `/etc/mimo-code-webui/webui.env` in WebUI Settings.
- **Upgrade rolled back**: inspect `journalctl -u mimo-code-webui`; the failed release remains under `releases/` for diagnosis.
- **`/status` works but chat fails**: check `mimo --version`, `MIMO_CONFIG_PATH`, service-user permissions, and MiMo startup errors in the journal.
- **Port conflict**: choose another WebUI port; keep `MIMO_HOST=127.0.0.1` and select an unused `MIMO_PORT` in the env file if required.
