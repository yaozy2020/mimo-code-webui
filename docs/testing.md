# Testing

Run the full verification gate before release:

```bash
npm run verify
```

Optional browser smoke checks require a running WebUI:

```bash
npm run smoke:browser
npm run smoke:browser:system
```

Browser smoke scripts are runtime diagnostics, not the primary regression suite.

The browser smoke check verifies that the app shell, start screen, or auth prompt renders without browser console errors. `SMOKE_SESSION_ID` is reserved for a future URL-addressable session regression; current builds log a warning and skip that assertion because sessions are selected through app state rather than a stable route.

## Release Verification

Production packaging requires a clean Git worktree. Local development may exercise the packager with `RELEASE_ALLOW_DIRTY=true`, but those artifacts are not releasable.

Every release contains `release-manifest.json` with the Git commit, tool versions, lockfile digest, and per-file digests. The installer verifies the manifest after extraction. The outer `.sha256` detects corruption; release-source authentication additionally requires a project-controlled signing key and is a release gate, not something generated ad hoc on a deployment host.

Against a running production build, run `SMOKE_URL=http://127.0.0.1:8090/ npm run smoke:browser:reconcile`. This deterministic browser contract smoke verifies that an SSE EOF reconnect and a visible-page restoration both reload messages, todos, pending permissions, and pending questions before updating the rendered session.

Run `SMOKE_URL=http://127.0.0.1:8090/ npm run smoke:browser:cancel` to verify native cancellation calls the session abort endpoint exactly once, while local-run cancellation aborts its originating stream without issuing a non-streaming fallback request.

Before a production release, run the install, upgrade, failed-upgrade rollback, reboot, and uninstall matrix on clean Debian 12 and Ubuntu 24.04 systemd VMs. Static deployment tests do not replace that matrix.

When clean VMs are unavailable, `npm run verify` still executes a zero-cost local deployment sandbox. The sandbox redirects all install roots and the systemd command log into owned temporary directories, then runs real installer actions for first install, duplicate-install rejection, upgrade, failed-upgrade rollback, explicit rollback, status, uninstall, and purge. Test mode requires both `MIMO_DEPLOY_TEST_MODE=1` and an existing non-root-owned `MIMO_DEPLOY_TEST_ROOT`; it refuses root execution.

The sandbox proves installer state transitions and cleanup behavior without touching the host service. It does not prove boot-time systemd behavior, distribution-specific security policy, or service-user runtime visibility, so those remain release-candidate gates rather than silently passing.
