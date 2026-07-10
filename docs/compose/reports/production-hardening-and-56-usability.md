# Production Hardening And 5.6 Usability Report

## Summary

Implemented the production hardening plan without relying on GitHub Actions quota. The release gate is now local/self-hosted friendly, production startup can be made immutable, auth can use `HttpOnly` cookies, responses carry request IDs, and 5.6 is documented as not cleared for background actor workflows until actor delivery is verified.

## Completed

- Added `POST /login` and `POST /logout` with `mimo_webui_auth` as `HttpOnly; SameSite=Lax` cookie while keeping Bearer auth compatibility for existing clients.
- Updated frontend requests to send same-origin credentials and moved the auth dialog to `/login` instead of persisting new auth tokens in `localStorage`.
- Added `X-Request-ID` response headers and request-id-aware route error logs.
- Added `scripts/verify-release.sh` as the local release gate: optional `npm ci`, then `npm run verify`, then `npm audit --omit=dev`.
- Added `MIMO_WEBUI_STRICT_RELEASE=true` startup mode so production fails fast when dependencies or build artifacts are missing.
- Enhanced browser smoke checks to assert visible app/auth shell rendering and browser console cleanliness.
- Added `scripts/model-runtime-smoke.mjs` for explicit model command smoke checks and documented the 5.6 background actor rollout rule.
- Updated deployment, testing, operations, and systemd docs for the new release gate and strict production mode.

## Verification

- `node --import tsx server/src/app.test.mjs` passed after adding cookie auth and request ID assertions.
- `npm run typecheck` passed.
- `node scripts/model-runtime-smoke.mjs` skipped cleanly when no model smoke command env vars were supplied.
- `node --check scripts/browser-smoke.mjs && node --check scripts/model-runtime-smoke.mjs` passed.
- Temporary production server smoke passed with `PORT=8090 HOST=127.0.0.1 MIMO_HOST=127.0.0.1 MIMO_PORT=4096 AUTH_TOKEN=smoke-test-token npm start`.
- `SMOKE_URL=http://127.0.0.1:8090/ npm run smoke:browser` passed.
- `SMOKE_URL=http://127.0.0.1:8090/ npm run smoke:browser:system` passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- `./scripts/verify-release.sh` passed; it ran full `npm run verify` and `npm audit --omit=dev`.

## Not Fully Verified

- 5.6 background actor compatibility remains untrusted. This session observed actors returning `idle`, `turnCount: 0`, and no output immediately after spawn. Direct command smoke can be run with `MODEL_RUNTIME_SMOKE_55` and `MODEL_RUNTIME_SMOKE_56`, but background actor delivery still requires the manual `READY` actor test described in `docs/operations.md`.

## Production Readiness Verdict

The project is closer to controlled production use: auth token exposure is reduced, request correlation exists, release verification no longer depends on GitHub quota, browser smoke passes against a local production server, and production startup can be immutable. It is still not a broad multi-user/public production system until 5.6 actor workflows pass the documented delivery gate and a deployment-specific smoke is run in the target environment.
