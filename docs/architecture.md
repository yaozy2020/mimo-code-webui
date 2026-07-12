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

## Data Ownership And Backups

WebUI releases, WebUI configuration, MiMo configuration, MiMo state, and workspaces are separate ownership layers. Release rollback changes application code only and never restores MiMo data. The backup timer archives WebUI/MiMo configuration and MiMo state, but deliberately excludes workspace trees; workspace backup remains an external operator responsibility.

SQLite files are copied only while the WebUI service and its managed MiMo process are stopped. A live single-file database copy is rejected. Every completed backup contains `backup-manifest.json` with the complete file set, sizes, and SHA-256 digests, and `scripts/backup-state.mjs verify <directory>` validates it before restoration.
