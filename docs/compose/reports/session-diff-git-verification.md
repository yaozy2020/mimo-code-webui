---
feature: session-diff-git-verification
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-07-06-observability.md
branch: master
commits: uncommitted
---

# Session Diff Git Verification — Final Report

## What Was Built

MiMoCode WebUI now has the frontend pieces needed to display agent observability: tool call cards and session file-change summaries. Tool calls are parsed from official `tool` message parts and rendered inside assistant messages with tool name, status, input, output, and error details. Session diffs are accepted from official `session.diff` SSE events and displayed in the chat toolbar as changed file count plus additions/deletions.

The missing `session.diff` output was traced to an environment/project-state issue rather than a frontend parsing issue. The WebUI directory was not a Git repository, so MiMo serve registered it under the global project with `worktree: "/"` and no `vcs: "git"`. Official snapshot/diff logic only runs when the project has `vcs === "git"`, so every diff request returned `[]` even after real file writes succeeded.

The directory was initialized as a Git repository with `git init`, and `mimo serve` was restarted with a process-scoped `safe.directory` override because the parent directory is owned by another user. After that, MiMo serve recognized `/vol2/1000/下载/mimo/mimo-code-webui` as a Git project and real WebUI file edits produced non-empty `session.diff` data.

## Architecture

### Frontend Observability

The frontend keeps the existing React chat layout and extends current data mapping instead of replacing the message model.

- `web/src/api/session.ts` preserves official `tool` and `reasoning` parts when converting raw MiMo serve messages into WebUI `Message` objects.
- `web/src/types/index.ts` defines `MessagePart` support for `tool` and `reasoning`, and adds `SnapshotFileDiff` for official diff payloads.
- `web/src/components/chat/MessageBubble.tsx` renders compact tool cards under assistant messages.
- `web/src/hooks/useStreamingMessage.ts` handles `session.diff` events and writes them into app state.
- `web/src/stores/appStore.tsx` stores `sessionDiffs` keyed by session ID.
- `web/src/components/chat/PromptToolbar.tsx` renders a diff summary badge and the first few changed files.

### Official Diff Data Flow

Official MiMo Code computes session diffs through snapshot state, not directly from tool metadata.

The relevant official files are:

- `/tmp/MiMo-Code/packages/opencode/src/snapshot/index.ts`
- `/tmp/MiMo-Code/packages/opencode/src/session/summary.ts`
- `/tmp/MiMo-Code/packages/opencode/src/session/processor.ts`
- `/tmp/MiMo-Code/packages/opencode/src/server/routes/instance/session.ts`

The effective flow is:

```text
project.vcs === "git"
  -> Snapshot.track() produces step-start / step-finish snapshot hashes
  -> SessionSummary.computeDiff() compares from/to snapshots
  -> SessionSummary.summarize() stores ["session_diff", sessionID]
  -> GET /session/:sessionID/diff returns the stored diff
  -> SSE session.diff can update the WebUI toolbar
```

If the project is not a Git project, `Snapshot.enabled()` returns false and there are no usable snapshot hashes. `SessionSummary.computeDiff()` then returns `[]`.

## Root Cause

Before initialization, the WebUI directory was not a Git worktree:

```bash
git rev-parse --show-toplevel
```

Result:

```text
fatal: not a git repository (or any parent up to mount point /)
Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).
```

MiMo serve project metadata confirmed that the directory was not a Git-backed project:

```http
GET http://127.0.0.1:4096/project
```

Before fix, the relevant project entry was only the global fallback:

```json
{
  "id": "global",
  "worktree": "/",
  "sandboxes": []
}
```

Official snapshot code has this gate:

```ts
const enabled = Effect.fnUntraced(function* () {
  if (state.vcs !== "git") return false
  return (yield* config.get()).snapshot !== false
})
```

Because `state.vcs` was not `git`, snapshot tracking was disabled. Real `write` tool calls still changed files, but `GET /session/:id/diff` had no snapshot data and returned `[]`.

## Fix Applied

The WebUI directory was initialized as a Git repository:

```bash
git init
```

No commit was created.

The repository already had a suitable `.gitignore` excluding heavy or generated content:

```text
node_modules/
web/dist/
server/dist/
*.log
.env
.mimocode/
```

After `git init`, Git rejected the repo as dubious because the parent directory and `.git` directory have different owners:

```text
/vol2/1000/下载/mimo/mimo-code-webui       com.dustinky.qwenpaw:com.dustinky.qwenpaw
/vol2/1000/下载/mimo/mimo-code-webui/.git  yzy:Users
```

The process avoided writing global Git config. Instead, `mimo serve` was restarted with a process-scoped safe-directory override:

```bash
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory \
GIT_CONFIG_VALUE_0=/vol2/1000/下载/mimo/mimo-code-webui \
mimo serve --hostname=127.0.0.1 --port=4096
```

After restart, `GET /project` included the WebUI directory as a Git project:

```json
{
  "id": "c83cca3f-9602-415c-905d-037b84b19037",
  "worktree": "/vol2/1000/下载/mimo/mimo-code-webui",
  "vcs": "git"
}
```

## Usage And Operations

For the concise startup checklist and real-chain verification matrix, see:

```text
docs/compose/reports/webui-startup-and-verification.md
```

For future restarts, if directory ownership remains mixed, start `mimo serve` with the same process-scoped safe-directory environment. Without it, Git may again reject the repository and MiMo snapshot/diff may fail.

Recommended runtime command:

```bash
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory \
GIT_CONFIG_VALUE_0=/vol2/1000/下载/mimo/mimo-code-webui \
mimo serve --hostname=127.0.0.1 --port=4096
```

Then serve WebUI normally on `8090`:

```bash
HOST=0.0.0.0 PORT=8090 npm start -w server
```

Do not use `git config --global --add safe.directory ...` unless a human explicitly wants a persistent Git trust setting. The verified fix used process environment only.

## Verification

### Frontend Build Gates

The frontend was verified after the observability changes:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build -w web
```

Both commands passed.

### Tool Call Display

Real LAN browser entrypoint:

```text
http://192.168.10.236:8090/
```

Prompt:

```text
TOOLCARD-REAL-CHAIN-1783317900 请使用 webfetch 读取 https://example.com，然后回复网页标题。
```

Verified visible UI output included:

```text
工具：webfetch
状态：completed
{
  "url": "https://example.com",
  "format": "markdown"
}
Example Domain
```

The assistant then replied with the page title.

### Diff Verification Before Git Init

A real WebUI file write successfully changed `docs/compose/diff-verification.txt`, and tool cards showed `read` and `write`, but every diff check returned empty:

```http
GET /session/:sessionID/diff?messageID=<user-message-id>
```

Result:

```json
[]
```

Session summary also showed:

```json
{
  "additions": 0,
  "deletions": 0,
  "files": 0
}
```

### Diff Verification After Git Init

After `git init` and process-scoped `safe.directory` restart, real 8090 WebUI edited:

```text
docs/compose/diff-verification.txt
```

from:

```text
diff verified 1783318200
```

to:

```text
diff verified 1783320400
```

Verified session:

```text
ses_0c9d20a32ffeYdCxkqv2ie49PE
```

Server summary became:

```json
{
  "additions": 1,
  "deletions": 1,
  "files": 1
}
```

Diff API returned:

```json
[
  {
    "file": "docs/compose/diff-verification.txt",
    "additions": 1,
    "deletions": 1,
    "status": "modified"
  }
]
```

Patch content:

```diff
-diff verified 1783318200
+diff verified 1783320400
```

The WebUI toolbar displayed:

```text
变更 1 文件 +1 -1
docs/compose/diff-verification.txt
```

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [dead end] Initially treated empty `session.diff` as a possible frontend parsing issue; direct `/session/:id/diff` calls proved the service itself returned `[]`.
- [pivot] Tool call display was kept independent from `session.diff` because tool metadata is available even when snapshot diff is unavailable.
- [lesson] Official `session.diff` depends on Git-backed snapshots, so WebUI code tasks should run inside a Git project if file-change summaries are expected.
- [lesson] Mixed directory ownership can block Git with `dubious ownership`; process-scoped `GIT_CONFIG_COUNT` safe-directory settings avoid modifying global config.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-07-06-observability.md` | Implementation plan | Tool cards and session diff display |
| `web/src/components/chat/MessageBubble.tsx` | UI implementation | Renders tool cards |
| `web/src/components/chat/PromptToolbar.tsx` | UI implementation | Renders todo and diff summaries |
| `web/src/api/session.ts` | Data mapping | Preserves `tool` and `reasoning` parts |
| `web/src/hooks/useStreamingMessage.ts` | SSE handling | Handles `session.diff` |
| `/tmp/MiMo-Code/packages/opencode/src/snapshot/index.ts` | Official reference | Snapshot gate requires `vcs === "git"` |
| `/tmp/MiMo-Code/packages/opencode/src/session/summary.ts` | Official reference | Diff is computed from step snapshots |
