# Governance Closeout Design

## [S1] Objective

Close the verified gaps discovered after the six-stage production governance baseline while preserving the product's dual purpose: a dependable personal MiMoCode WebUI and a safe third-party Linux/systemd deployment.

The closeout is gate-driven. Each gate must be independently testable, reviewable, and reversible. Existing completed governance is not reopened.

## [S2] Scope boundaries

Included:

- User-visible reliability defects in native and local-run message delivery.
- Offline-backup correctness when MiMo ownership differs.
- Upgrade compensation and service-state preservation.
- Release authenticity, Git provenance, and MiMo compatibility gates.

Excluded:

- Reverse-proxy subpath support; document root-path-only support instead.
- New UI features or visual redesign.
- Arbitrary deployment roots outside the supported systemd layout.
- Fixing upstream actor `turnCount` telemetry; keep the multi-agent rollout gate closed.
- Restarting the user's live WebUI during implementation. LAN verification waits for an explicit restart request.

## [S3] Gate G1: Runtime reliability

Complete the existing streaming-display fix first and keep SSE/store deltas unbuffered. Large display backlogs must have bounded per-frame growth, bounded catch-up time, and safe Unicode boundaries.

Correct local-run prompt construction so text and supported textual attachments are each included exactly once. A native prompt failure must not leave a successful-looking optimistic message; the UI must either remove it or expose an explicit retryable failure state using the smallest change compatible with the current store.

Local-run timeout must produce an explicit terminal error instead of a successful EOF. The frontend may fall back from streaming to non-streaming only for a positively identified unsupported-streaming condition, never for an ambiguous network/provider failure that may already have incurred execution.

Evidence:

- Focused tests for prompt composition, optimistic failure reconciliation, timeout framing, fallback classification, display pacing, and Unicode boundaries.
- `npm run verify` passes.
- After an explicitly requested restart, LAN browser evidence covers a long streaming reply, upward-scroll preservation, attachment delivery, cancellation, and visible timeout/failure behavior.

## [S4] Gate G2: Backup ownership safety

The installer must not automatically enable scheduled backups. Documentation and CLI output must require the operator to enable the timer only after confirming that the installed service owns every protected MiMo process and data writer.

Scheduled backup must refuse to run when runtime configuration enables external MiMo reuse. Backup execution must preserve the main service's pre-backup state: restart it only if the backup operation itself stopped an active service. A service intentionally inactive before backup remains inactive afterward.

Evidence:

- Static deployment tests assert timer opt-in and external-reuse refusal.
- Sandbox/systemd-equivalent tests cover active, inactive, failed-backup, and externally owned MiMo states.
- Backup manifest and restore verification remain unchanged and passing.

## [S5] Gate G3: Deployment transaction integrity

Upgrade preflight backup and service restoration form a transaction boundary. If the old release cannot return healthy after the pre-upgrade backup, upgrade must abort with the old release selected and an explicit recovery result. No candidate extraction, release switch, or misleading success state may occur.

The transaction must remember whether the service was active before the operation. Upgrade and rollback may restore only the prior state unless the command's documented contract explicitly requires activation.

Evidence:

- Sandbox tests inject failure after backup and before candidate installation.
- Tests prove release symlink, environment, units, service state, and backup remain consistent after compensation.
- Existing install, upgrade, rollback, uninstall, purge, and reboot lifecycle tests pass.

## [S6] Gate G4: Release provenance and compatibility

The formal release command must fail without a protected Ed25519 signing key. An explicit development-only unsigned command or flag may remain for local packaging, but its artifacts must be unmistakably non-installable and must not use the formal release path.

A formal release must require all of the following:

- Clean tracked worktree.
- `package.json` version equals an annotated or signed `v<version>` tag.
- The tag resolves to `HEAD` on the approved release branch.
- Archive metadata records the exact commit and version.

Deployment must enforce a documented minimum compatible MiMo version and perform a bounded preflight compatibility probe for the health and protocol surface required by this WebUI. Failure occurs before service mutation.

Root-path deployment remains the supported reverse-proxy contract and is stated explicitly in deployment documentation.

Evidence:

- Packaging tests cover missing key, tag mismatch, dirty tree, wrong branch, and valid signed release.
- Installer tests cover missing, too-old, unparsable, and compatible MiMo versions plus failed protocol probes.
- A release candidate passes signature, SHA-256, inner manifest, install, upgrade, rollback, and restore verification.

## [S7] Execution and publication gates

Order is G1, G2, G3, then G4. G2 and G3 may share deployment test infrastructure but remain separate commits and review checkpoints. G4 begins only after runtime and data-safety gates pass.

Every gate requires focused red-green tests, full verification, an independent code review, and a concise report under `docs/compose/reports`. No commit is pushed and no release is published without explicit user instruction. Live service restarts remain user-controlled.

Completion means all four gates pass, the final worktree contains only intentional changes, and the closeout report lists remaining external constraints rather than representing them as completed product work.
