# Attachment Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable minimal file/image attachments in the chat composer and send them to MiMo serve using official file parts.

**Architecture:** Keep attachments as local `InputBar` state until send. Convert selected files to data URLs and pass them as `type: "file"` prompt parts through the existing `sendPrompt()` path. Do not add backend upload storage in this slice.

**Tech Stack:** React 18, TypeScript, Vite, MiMo serve `prompt_async` FilePartInput.

## Global Constraints

- Use official file part shape: `type`, `mime`, `filename`, `url`.
- Verify through `http://192.168.10.236:8090/` and real `/session/:id/message` parts.
- Use `npm run typecheck -w web` and `npm run build -w web` as gates.
- Do not implement large-file upload, storage, or chunking in this slice.

---

### Task 1: Composer Attachments

**Files:**
- Modify: `web/src/components/chat/InputBar.tsx`
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `web/src/api/message.ts`

**Interfaces:**
- `InputBar.onSend(text, mode, attachments)` sends selected data-url attachments.
- `ChatArea.handleSend` combines text part and file parts.

- [ ] Enable paperclip with hidden `<input type="file" multiple>`.
- [ ] Convert selected files to data URLs.
- [ ] Show removable attachment chips.
- [ ] Allow attachment-only sends.
- [ ] Reject `/local-run` fallback with attachments instead of dropping parts.

### Task 2: Attachment Rendering And Verification

**Files:**
- Modify: `web/src/components/chat/MessageBubble.tsx`

**Interfaces:**
- Display local/history file parts below user messages.

- [ ] Render file chips and inline image preview for `file` parts with image MIME.
- [ ] Verify a `.txt` and a `.png` selected in 8090 reach server message parts.
