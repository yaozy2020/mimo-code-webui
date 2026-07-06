# Kimi-Style Workbench Implementation Plan

**Goal:** Upgrade the current MiMoCode WebUI into a Kimi/opencode-inspired agent workbench without changing backend proxy semantics.

**Architecture:** Keep the Express server unchanged. Implement the workbench in React by wiring the existing `Sidebar`, improving `ChatArea` and `InputBar`, and surfacing current SSE-driven status in a more useful toolbar.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, local shadcn-style UI components, lucide-react.

## Tasks

- Workbench layout: render the existing sidebar in the app shell and make the header compact/status-focused.
- Composer: add `Plan`, `/` command hints, and `@` reference hints while preserving existing send API semantics.
- Status and approvals: show the prompt toolbar in chat, improve empty state, and clarify permission/question dialogs.
- Verification: run `npm run typecheck -w web` and `npm run build -w web` if `node/npm` are available.
