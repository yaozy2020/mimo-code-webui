# Phase 6 Observability And Release Gate Report

## Completed

- HTTP request and route-error logs use one-line JSON events with request IDs, status codes, and durations without query strings or authentication values.
- The MiMo supervisor tracks restart count, consecutive failures, last restart time and reason, last healthy time, and startup duration.
- Supervisor metrics are exposed only through authenticated `/local-status`; public `/status` remains minimal.
- The repository systemd unit files use non-executable permissions.
- Production-build browser contract smoke covers SSE EOF reconnect, visible-page snapshot reconciliation, native cancellation, and local-run cancellation without fallback.
- Browser smoke exposed and verified fixes for a repeated session/todo request loop and a duplicated `/api/api/config` model-discovery path.
- Full verification, production dependency audit, and systemd static verification were run during the governance pass.

## Remaining External Release Gates

- Run the full deployment matrix on a clean Ubuntu 24.04 VM.
- Confirm the browser reconciliation and cancellation paths once against a real provider session in the target deployment without using a production conversation.
- Generate and independently distribute the production signing key; the code now requires Ed25519 verification before installation or upgrade and tests forged signatures.
- Repeat the capacity benchmark with deployment-specific data composition before changing the default retention or recovery objectives.

## Backup Capacity Benchmark

- Reproducible command: `npm run benchmark:backup`; defaults to 1 GiB split across 64 files of 16 MiB.
- Host result: 1,073,741,824 source bytes, 1,073,752,475 backup bytes, 1.0 disk amplification, 1,537 ms backup, 613 ms full verification, and 811 ms isolated restore.
- The benchmark excludes service stop/start time; the Ubuntu VM measured the normal WebUI and MiMo startup window separately.
- `MIMO_BACKUP_KEEP` now defaults to 7 and pruning occurs only after a newly verified snapshot is atomically promoted. Capacity guidance is `(keep + 2) * protected data size`, which gives a 9x protected-data budget at the default retention.
- The implementation hashes one complete file in memory. Deployments with unusually large individual files should benchmark that maximum file size or move hashing to streams before increasing scale.
- Keep 5.6 background actor workflows disabled until the documented delivery test passes twice consecutively.

## Ubuntu 24.04 VM Evidence

- Guest: Ubuntu 24.04, kernel 6.8, systemd 255, Node.js 18.19.1, npm 9.2.0, 2 vCPU, 4 GiB RAM, 20 GiB qcow2.
- The official Noble cloud image was verified against its published SHA-256 before creating a disposable overlay.
- A failed first install caused by an intentionally incomplete MiMo test stub compensated cleanly: the service, unit, service user, release link, configuration, and state were removed.
- After correcting the stub to match the real MiMo readiness contract, first install completed with the service enabled and active, authenticated public status healthy, the release symlink correct, and exactly one managed MiMo process.
- The VM exposed that backup unit files were packaged but not installed. The deployment transaction now installs and enables the backup timer with the main service, restores all units during rollback, and removes all units during uninstall; sandbox regression coverage passed.
- A real upgrade from `76ae88b` to `2b76b41` created a required offline backup before switching releases, retained the old release as `previous`, and returned healthy. Because that upgrade was initiated by the old release's installer, the newly added timer migration requires one subsequent upgrade driven by the new installer; this bootstrap boundary is being verified separately.
- A subsequent new-installer upgrade installed and enabled the backup timer. Manual offline backup stopped WebUI and its managed MiMo process, produced a healthy manifest-backed snapshot, and restored both processes; HTTP became healthy after the normal startup window.
- Full guest reboot preserved the enabled service and timer, returned HTTP healthy, and left exactly one managed MiMo process. Explicit release rollback preserved service health and timer enablement.
- Protected purge verified the external backup before deleting release/config/state, retained the workspace sentinel, and a clean reinstall enabled both the main service and backup timer.
- Another healthy upgrade confirmed that the mandatory pre-upgrade backup and old-service recovery occur before candidate release switching; failure injection must therefore target the candidate release identity rather than the next MiMo start globally.
- The systemd `PrivateTmp=true` boundary also prevented a host-visible `/tmp` failure marker from reaching the service, confirming the intended temporary-directory isolation.
- Candidate-specific failure injection from the service state directory forced a real upgrade health-check failure. The installer restored the previous `current` release, retained a healthy pre-upgrade backup, kept the backup timer enabled, returned HTTP healthy after the normal startup window, and left exactly one managed MiMo process.

## Ubuntu 24.04 Verdict

The clean install, failed-first-install compensation, required pre-upgrade backup, successful upgrade, candidate failure rollback, explicit rollback, offline backup recovery, full reboot, uninstall, protected purge, workspace retention, and clean reinstall matrix passed on Ubuntu 24.04. Runtime model behavior was intentionally represented by a VM-only MiMo protocol stub; real provider/model compatibility remains a separate gate.
