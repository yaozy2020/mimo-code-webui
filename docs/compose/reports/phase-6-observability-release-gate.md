# Phase 6 Observability And Release Gate Report

## Completed

- HTTP request and route-error logs use one-line JSON events with request IDs, status codes, and durations without query strings or authentication values.
- The MiMo supervisor tracks restart count, consecutive failures, last restart time and reason, last healthy time, and startup duration.
- Supervisor metrics are exposed only through authenticated `/local-status`; public `/status` remains minimal.
- The repository systemd unit files use non-executable permissions.
- Production-build browser contract smoke covers SSE EOF reconnect, visible-page snapshot reconciliation, native cancellation, and local-run cancellation without fallback.
- Browser smoke exposed and verified fixes for a repeated session/todo request loop and a duplicated `/api/api/config` model-discovery path.
- Full verification, production dependency audit, and systemd static verification were run during the governance pass.
- A production Ed25519 signing key was generated outside the repository with `0700` directory and `0600` key permissions. The public key and independently checkable SHA-256 fingerprint are published under `deploy/keys`.
- Main-service and backup-service failures trigger a no-restart Webhook alert unit. The payload excludes authentication tokens, prompts, paths, and MiMo configuration; an absent Webhook degrades to a journal warning without a failure loop.

## Remaining External Release Gates

- Confirm the browser reconciliation and cancellation paths once against a real provider session in the target deployment without using a production conversation.
- Create an encrypted offline copy of the production signing private key and store it separately from this host.

## Backup Capacity Benchmark

- Reproducible command: `npm run benchmark:backup`; defaults to 1 GiB split across 64 files of 16 MiB.
- Host result: 1,073,741,824 source bytes, 1,073,752,475 backup bytes, 1.0 disk amplification, 1,537 ms backup, 613 ms full verification, and 811 ms isolated restore.
- The benchmark excludes service stop/start time; the Ubuntu VM measured the normal WebUI and MiMo startup window separately.
- `MIMO_BACKUP_KEEP` now defaults to 7 and pruning occurs only after a newly verified snapshot is atomically promoted. Capacity guidance is `(keep + 2) * protected data size`, which gives a 9x protected-data budget at the default retention.
- Backup generation and verification hash files through a fixed 1 MiB buffer, so memory use is independent of the largest individual file.
- A 1.2 GB single-file benchmark passed with 1.0 disk amplification, 1,559 ms backup, 603 ms verification, and 1,136 ms isolated restore.
- Keep 5.6 background actor workflows disabled: two independent tests returned `READY`, but both still reported `turnCount: 0`, failing the strict delivery-plus-telemetry gate.

## Deployment Data Sizing

- The inspected deployment contains approximately 7.9 GB under MiMo data and 51 MB under MiMo configuration.
- Five recovery/database copies are approximately 1.16 GB each, while two session-diff files are approximately 376 MB and 367 MB. These account for most of the protected footprint.
- At the default retention of 7, the conservative 9x capacity rule requires approximately 72 GB. Archive obsolete recovery copies outside the live state tree only after independent backup verification; do not delete the active database, WAL, or SHM files.

## Ubuntu 24.04 VM Evidence

- Guest: Ubuntu 24.04, kernel 6.8, systemd 255, Node.js 18.19.1, npm 9.2.0, 2 vCPU, 4 GiB RAM, 20 GiB qcow2.
- The official Noble cloud image was verified against its published SHA-256 before creating a disposable overlay.
- A failed first install caused by an intentionally incomplete MiMo test stub compensated cleanly: the service, unit, service user, release link, configuration, and state were removed.
- After correcting the stub to match the real MiMo readiness contract, first install completed with the service enabled and active, authenticated public status healthy, the release symlink correct, and exactly one managed MiMo process.
- The VM exposed that backup unit files were packaged but not installed. The deployment transaction now installs and enables the backup timer with the main service, restores all units during rollback, and removes all units during uninstall; sandbox regression coverage passed.
- A real upgrade from `76ae88b` to `2b76b41` created a required offline backup before switching releases, retained the old release as `previous`, and returned healthy. A subsequent upgrade driven by the new installer completed the backup timer migration.
- A subsequent new-installer upgrade installed and enabled the backup timer. Manual offline backup stopped WebUI and its managed MiMo process, produced a healthy manifest-backed snapshot, and restored both processes; HTTP became healthy after the normal startup window.
- Full guest reboot preserved the enabled service and timer, returned HTTP healthy, and left exactly one managed MiMo process. Explicit release rollback preserved service health and timer enablement.
- Protected purge verified the external backup before deleting release/config/state, retained the workspace sentinel, and a clean reinstall enabled both the main service and backup timer.
- Another healthy upgrade confirmed that the mandatory pre-upgrade backup and old-service recovery occur before candidate release switching; failure injection must therefore target the candidate release identity rather than the next MiMo start globally.
- The systemd `PrivateTmp=true` boundary also prevented a host-visible `/tmp` failure marker from reaching the service, confirming the intended temporary-directory isolation.
- Candidate-specific failure injection from the service state directory forced a real upgrade health-check failure. The installer restored the previous `current` release, retained a healthy pre-upgrade backup, kept the backup timer enabled, returned HTTP healthy after the normal startup window, and left exactly one managed MiMo process.

## Ubuntu 24.04 Verdict

The clean install, failed-first-install compensation, required pre-upgrade backup, successful upgrade, candidate failure rollback, explicit rollback, offline backup recovery, full reboot, uninstall, protected purge, workspace retention, and clean reinstall matrix passed on Ubuntu 24.04. Runtime model behavior was intentionally represented by a VM-only MiMo protocol stub; real provider/model compatibility remains a separate gate.
