# Worktree State Archive

## Snapshot

Captured after the minimal project governance pass on 2026-07-09.

Current checkout:

```text
branch: master
mode: normal checkout, not a linked worktree
tracked modified files: 29
untracked notable paths before runtime-state cleanup: .mimo-home/, docs/compose/plans/2026-07-09-minimal-project-governance.md, docs/compose/reports/minimal-project-governance.md, scripts/mimo-watchdog.sh
verification: npm run typecheck passed; npm run build passed
```

## This Governance Pass

These changes belong to the minimal治理 pass just completed:

- `web/src/components/chat/ChatArea.tsx`: removed temporary runtime `[DEBUG]` logs around message load, refresh, send route, local-run assistant creation, stream deltas, and native prompt send.
- `web/src/hooks/useStreamingMessage.ts`: removed temporary runtime `[DEBUG]` logs around snapshot sync and `session.idle`.
- `web/src/stores/appStore.tsx`: removed temporary reducer `[DEBUG]` logs around message merge and content updates.
- `docs/compose/plans/2026-07-09-minimal-project-governance.md`: records the minimal cleanup plan and completed steps.
- `docs/compose/reports/minimal-project-governance.md`: records the delivered minimal cleanup state.

Runtime frontend source now has no `[DEBUG]` strings. The only remaining `console.log` under `web/src` is the standalone success line in `web/src/components/chat/modelRouting.test.mjs`.

## Existing Feature Change Groups

These tracked changes predate or sit outside the minimal debug cleanup and should be reviewed as separate commit candidates.

### Runtime And Backend Management

- `scripts/start.sh`: startup script changes, likely related to environment setup and production launch behavior.
- `server/src/index.ts`: base MiMo port scanning, managed MiMo health monitor/restart, `/local-config/restart-mimo`, `local-run` streaming, and mutable base MiMo server state.
- `server/src/config.ts`: MiMo config path move to `~/.config/mimocode/config.json`, legacy `~/.mimo/mimo.config.json` fallback/migration, and model capability fields.
- `scripts/mimo-watchdog.sh`: productized manual watchdog fallback for deployments where the WebUI backend cannot be restarted yet; it now manages only the `mimo serve` process recorded in its own PID file.

### Model Routing And Settings

- `web/src/api/client.ts`: runtime model loading from `/api/config`, backend/manual model capability merging, local-run stream client, and MiMo restart client.
- `web/src/components/chat/modelRouting.ts`: model route selection changes for native vs local-run routing.
- `web/src/components/chat/modelRouting.test.mjs`: test coverage for routing behavior.
- `web/src/components/settings/SettingsPanel.tsx`: model capability labels, warning for non-workspace models, manual model save path, and MiMo restart UI.

### Chat Runtime And Streaming

- `web/src/components/chat/ChatArea.tsx`: local-run streaming fallback for models unavailable to `mimo serve`, prompt part assembly, and active chat behavior.
- `web/src/hooks/useStreamingMessage.ts`: agent busy awareness during post-idle snapshot sync to avoid clobbering active streams.
- `web/src/stores/appStore.tsx`: message merge behavior that preserves longer assistant content and recomputes context usage.
- `web/src/api/message.ts`: prompt/request payload shape adjustments.

### Workspace And Session UI

- `web/src/App.tsx`: desktop sidebar open state and layout wiring.
- `web/src/components/layout/Header.tsx`: sidebar toggle controls and header adjustments.
- `web/src/components/layout/Sidebar.tsx`: responsive sidebar width/visibility, session card layout, status badges, and dialog close callbacks.
- `web/src/components/chat/WorkspaceSessionDialog.tsx`: workspace session creation callback and layout refinements.
- `web/src/components/chat/AttachSessionDialog.tsx`: attach success callback and mobile height refinement.

### Message, File, And Visual Polish

- `web/src/components/chat/InputBar.tsx`: input/attachment UI adjustments.
- `web/src/components/chat/MessageBubble.tsx`: message rendering changes, likely for tool/file/thinking presentation.
- `web/src/components/chat/MessageList.tsx`: message list layout adjustments.
- `web/src/components/chat/PromptToolbar.tsx`: toolbar/context/diff presentation adjustments.
- `web/src/components/files/FileChangesPanel.tsx`: file change panel presentation tweak.
- `web/src/components/ui/badge.tsx`, `web/src/components/ui/button.tsx`, `web/src/components/ui/dialog.tsx`: shared UI primitive styling changes.
- `web/src/index.css`, `web/tailwind.config.js`, `web/index.html`, `web/vite.config.ts`: global styling/build/document metadata adjustments.

### Documentation

- `docs/compose/plans/2026-07-07-openai-streaming-fallback.md`: existing plan updated during earlier work.

## Untracked Local Runtime State

`.mimo-home/` is a local home/cache/database tree created by running MiMo/WebUI with a project-local home. It includes config, cache, extracted skills, npm cache, and SQLite runtime state.

Recommended treatment:

- Do not commit `.mimo-home/` contents.
- `.mimo-home/` is now listed in `.gitignore` so future `git status` output stays focused on source and docs.
- If a portable config sample is needed, extract only a sanitized example file into docs; do not commit live DB/cache files.

## Recommended Commit Slices

If the current state is later committed, split it into reviewable slices:

1. Governance hygiene: `.gitignore`, debug log removal, minimal governance plan/report, complete governance plan, and this archive report.
2. Runtime/backend management: `server/src/index.ts`, `server/src/config.ts`, `scripts/start.sh`, `scripts/mimo-watchdog.sh`, and README runtime docs.
3. Model routing/settings: `web/src/api/client.ts`, `web/src/components/chat/modelRouting.ts`, `web/src/components/chat/modelRouting.test.mjs`, and `web/src/components/settings/SettingsPanel.tsx`.
4. Workspace/session UI: `web/src/App.tsx`, `web/src/components/layout/Header.tsx`, `web/src/components/layout/Sidebar.tsx`, `web/src/components/chat/WorkspaceSessionDialog.tsx`, and `web/src/components/chat/AttachSessionDialog.tsx`.
5. Message/file visual polish: message rendering, input bar, toolbar, file changes, UI primitives, CSS/Tailwind/Vite/index adjustments.
6. Final LAN/runtime verification: HTTP-level checks now pass for `mimo serve`, WebUI `/status`, LAN root HTML, and workspace-routed session API. Browser DOM smoke remains blocked by local Chromium crashpad startup failure.

## Unresolved Decisions

- Whether to commit the recommended slices now or keep the current worktree uncommitted for further治理.
- Browser DOM verification still needs a working Chromium/Playwright environment; HTTP-level LAN verification has been run successfully in this session.
- Whether the older `docs/compose/plans/2026-07-07-openai-streaming-fallback.md` update still reflects the current implementation or should be superseded by a final report.
- Whether to continue from governance into the existing roadmap's core chat stability probes.

## Verification Evidence

Commands run after the minimal治理 pass:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

Both commands passed. `npm run build` produced `web/dist` and `server/dist`, which are ignored build outputs.

Additional runtime verification run during continued治理:

```bash
curl -sS http://127.0.0.1:4096/global/health
curl -sS http://127.0.0.1:8090/status
curl -sS -I http://127.0.0.1:8090/
curl -sS -I http://192.168.10.236:8090/
curl -sS http://127.0.0.1:4096/project
curl -sS "http://127.0.0.1:8090/api/session?directory=/vol2/1000/下载/mimo/mimo-code-webui"
```

Results:

- MiMo health returned `healthy: true`, version `0.1.4`.
- WebUI `/status` returned port `8090`, host `0.0.0.0`, MiMo healthy at `127.0.0.1:4096`.
- Local and LAN root requests returned `HTTP/1.1 200 OK`.
- MiMo project discovery includes `/vol2/1000/下载/mimo/mimo-code-webui` with `vcs: git`.
- Workspace-routed session listing returned sessions for the WebUI project directory.
- Playwright browser smoke was attempted but Chromium exited before page load with `chrome_crashpad_handler: --database is required`.
