# Architecture

MiMo Code WebUI has three runtime layers:

1. React/Vite frontend served from `web/dist` in production.
2. Express backend from `server/dist/index.js`.
3. MiMo Code `mimo serve`, either existing on `MIMO_HOST:MIMO_PORT` or managed by the backend.

The backend owns authentication, local configuration routes, release-time static serving, and proxying `/api/*` to MiMo serve.

The frontend must not assume MiMo internal paths except through explicit API client functions.

Current source-of-truth documents are:

- `README.md` for user setup.
- `docs/operations.md` for runtime operations.
- `docs/testing.md` for verification.
- `docs/architecture.md` for module boundaries.

Historical compose plans are execution records and may not describe current code.
