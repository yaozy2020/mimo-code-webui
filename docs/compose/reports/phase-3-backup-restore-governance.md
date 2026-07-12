# Phase 3 Backup And Restore Governance Report

## Scope

This report covers the code, sandbox, and Debian 12 VM evidence for layered MiMo Code WebUI backup and isolated restore. Program rollback and MiMo data restore remain separate operations. Workspace trees are not backed up or deleted by WebUI.

## Environment

- Host: fnOS with libvirt/KVM
- Guest: Debian 12 (bookworm), systemd
- Node.js: 18.20.4
- npm: 9.2.0
- MiMo Code: 0.1.5
- Guest VM: `webui-debian12-test`, 2 vCPU, 4 GiB RAM, 20 GiB qcow2

## Evidence

- A real systemd install initially exposed and then verified fixes for service-user directory ownership and release directory traversal permissions. Failed installs compensated cleanly before the fixes.
- `mimo-code-webui-backup.service` stopped WebUI and its managed MiMo process, produced a manifest-backed offline snapshot, and restored WebUI. The successful snapshot contained WebUI config, MiMo config, XDG data, XDG state, and MiMo memory/state files.
- A known SQLite dataset was restored into a new empty directory. `PRAGMA integrity_check` returned `ok`, `PRAGMA foreign_key_check` returned no rows, `user_version` remained `7`, one known message was present, and a second message could be written after restore.
- The isolated restore wrote `restore-report.json`; the measured file-copy restore duration was 7 ms for the fixture dataset.
- After a full guest reboot, the WebUI service and backup timer were enabled, WebUI and MiMo were healthy, the SQLite fixture remained intact, and exactly one managed `mimo serve` process was present.
- A real upgrade created a successful offline backup before switching the release and ended healthy.
- A failure injection using a read-only backup destination blocked upgrade before release switching. The previous release remained current and WebUI recovered to healthy.
- Authenticated `/local-status` reported the healthy backup timestamp and age. Public `/status` did not expose backup details.

## Automated Verification

- `npm run verify`
- `node scripts/backup-state.test.mjs`
- `node scripts/deployment.test.mjs`
- `node scripts/deployment-sandbox.test.mjs`
- `systemd-analyze verify deploy/systemd/mimo-code-webui-backup.service deploy/systemd/mimo-code-webui-backup.timer`

The sandbox matrix covers valid backup/restore, checksum corruption, extra files, missing and old manifests, unsafe symlinks, active SQLite rejection, non-empty restore targets, failed backup retention, upgrade backup gating, purge gating, and explicit break-glass behavior.

## Residual Release Gates

- Repeat the VM matrix on Ubuntu 24.04 before broad production release.
- Establish and independently distribute a trusted release signing key; SHA-256 and manifests prove integrity, not publisher identity.
- Validate deployment-specific storage capacity and retention policy with production-sized data.
