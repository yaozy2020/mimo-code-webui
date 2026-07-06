# Workspace-aware sessions design

## [S1] Problem

The WebUI currently hides the workspace choice when creating a session. On first load it can create a blank session without an explicit directory, and the existing session list does not provide a safe, intentional way to attach prior MiMo/CLI sessions. This makes the product feel disconnected from real coding work compared with Kimi Code, where a new conversation starts from an explicit workspace and existing work can be resumed intentionally.

## [S2] Protocol findings

Official MiMo session context is directory-based. The selected workspace is passed as request context with `?directory=<path>` or `x-mimocode-directory`, not as a JSON body field on `POST /session`. Session objects include `directory`, and later message/todo/diff/prompt requests should use the active session's directory so tool execution stays in the expected project instance.

## [S3] Product policy

Use the safe attach model:

- Default sidebar content shows only sessions created by this WebUI browser profile or explicitly attached by the user.
- New sessions are created from an explicit workspace path. The default path can come from the active session, last workspace, or server status, but the user must be able to change it before creating.
- Existing MiMo/CLI sessions are discoverable only through an attach dialog, not mixed into the default session list automatically.
- Attaching an existing session marks it visible in this WebUI profile; it does not fork, delete, or mutate the underlying MiMo session.

## [S4] User flow

First launch without a remembered WebUI-owned session shows a workspace-first empty state instead of silently creating a session. The primary actions are:

- Create session in workspace.
- Attach existing session.

New session opens a small dialog with workspace path and optional title. It calls `POST /api/session?directory=<workspace>` and activates the returned session.

Attach existing opens a dialog with two paths:

- By ID: load `GET /api/session/:id`, show title/directory, then attach on confirmation.
- Browse: fetch MiMo sessions for discovery, clearly label unattached sessions, and attach only selected sessions.

## [S5] Implementation scope

Minimum implementation for this slice:

- Persist `currentWorkspace` / last workspace in the frontend store.
- Keep owned session IDs as the default sidebar allowlist.
- Add explicit attach/detach actions for sessions.
- Fix session API helpers so `directory` is passed as a query parameter.
- Make prompt/message/todo/diff calls include the active session directory when available.
- Replace first-load auto-create with a workspace-first empty state when no active owned session exists.
- Add lightweight dialogs for new workspace session and existing-session attach.

Deferred:

- Full file picker for server-side directories.
- Project tree browsing.
- Session delete/fork/rename beyond existing behavior.
- Separate MiMo serve instances per workspace.

## [S6] Verification

Verification must include:

- Typecheck and build.
- LAN browser flow at `http://192.168.10.236:8090/` creating a new session with a chosen workspace.
- Network evidence that `POST /api/session?directory=...` is used instead of body `{ directory }`.
- Existing session attach flow marks a session visible only after explicit attach.
- First launch with cleared WebUI localStorage does not silently create a no-directory session.
