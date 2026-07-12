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
- Establish an independently distributed release signing key and require signature verification before installation or upgrade.
- Calibrate backup capacity, retention, and restore objectives with production-sized data.
- Keep 5.6 background actor workflows disabled until the documented delivery test passes twice consecutively.
