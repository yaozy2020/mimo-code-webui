# Kimi-Style Workbench Design

## [S1] Goal
Improve the MiMoCode WebUI toward Kimi Code and opencode's agent workbench experience while keeping MiMoCode as the product and preserving the current backend proxy architecture.

## [S2] Scope
Implement the first version as a frontend-focused workbench: visible session sidebar, central chat workspace, richer composer, agent/mode selection, command/reference entry hints, and clearer status/approval feedback.

## [S3] Backend Boundary
Do not rewrite `server` or add new backend APIs in this version. Continue sending prompts through `sendPrompt(sessionID, { agent, parts, variant })` and receiving state through the existing SSE stream.

## [S4] Kimi/OpenCode Alignment
Borrow the interaction model, not the full system: mode/agent switching, command affordances, references, approval clarity, and session management. Defer plugin marketplace, MCP setup, hooks, ACP, real subagent orchestration, and true file/video upload until backend support exists.

## [S5] UX Requirements
The first screen should feel like a working agent console, not a landing page. Empty state should offer compact starter actions. Composer controls should expose `Chat`, `Plan`, `Web`, and `Multi` modes with clear behavior labels.

## [S6] Verification
Use repo-defined gates only: `npm run typecheck -w web` and `npm run build -w web` for frontend changes, or clearly report if the environment lacks `node`/`npm`.
