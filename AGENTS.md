# AGENTS.md

## Project Shape
- This repo is an npm workspace with two packages: `web` and `server`; run workspace commands from the repo root.
- Frontend entrypoint is `web/src/main.tsx` -> `web/src/App.tsx`; use the `@/*` alias for imports under `web/src`.
- Backend entrypoint is `server/src/index.ts`; it serves `web/dist` in production and proxies `/api/*` to a managed or existing `mimo serve` process.
- `server/src/proxy.ts` strips the `/api` prefix before forwarding, so frontend `/api/session` reaches `mimo serve` as `/session`.
- `server/src/mimo.ts` starts `mimo serve --hostname=<MIMO_HOST> --port=<MIMO_PORT>` when `http://<MIMO_HOST>:<MIMO_PORT>/global/health` is not already healthy.

## Commands
- Install dependencies with `npm install` from the repo root; `package-lock.json` is the source of truth.
- Run both dev servers with `npm run dev`; Vite listens on `5173` and proxies API calls to backend `http://127.0.0.1:8080`.
- Run package-specific dev servers with `npm run dev -w server` or `npm run dev -w web`.
- Build with `npm run build`; this runs `web` first, then `server`.
- Typecheck with `npm run typecheck`, or focus with `npm run typecheck -w server` / `npm run typecheck -w web`.
- Start production with `npm start` after building, or use `./scripts/start.sh` on Linux / `scripts\start.bat` on Windows to auto-install missing deps and build missing frontend output; the build script emits both `web/dist` and `server/dist`.
- There are no repo test or lint scripts in `package.json`; use `npm run typecheck` and `npm run build` as the available verification gates.

## Runtime Notes
- Node.js `>=18` and the MiMo-Code CLI (`mimo`) are required for a fully working backend.
- Backend defaults: `HOST=0.0.0.0`, `PORT=8080`, `MIMO_HOST=127.0.0.1`, `MIMO_PORT=4096`.
- If `PORT` is unset and `8080` is busy, the backend auto-increments; if `PORT` is explicitly set and busy, startup fails.
- Setting `AUTH_TOKEN` protects `/api/*` with `Authorization: Bearer <token>`; `/status` and static frontend assets stay public so the login UI can load.
- Server status exposes MiMo config from `~/.mimo/mimo.config.json`; frontend settings and the WebUI auth token are stored in browser `localStorage`.

## Frontend Conventions
- UI is React 18 + TypeScript + Vite + Tailwind + shadcn/ui; shadcn config is `web/components.json` with `baseColor: slate` and CSS variables enabled.
- Tailwind scans `web/index.html` and `web/src/**/*.{ts,tsx}`; global CSS lives in `web/src/index.css`.
- TypeScript is strict in both packages; the web config also fails on unused locals and parameters.

## Editing Notes
- Keep indentation at 2 spaces and LF endings per `.editorconfig`.
- Do not edit generated build outputs in `web/dist` or `server/dist`; source lives under `web/src` and `server/src`.
