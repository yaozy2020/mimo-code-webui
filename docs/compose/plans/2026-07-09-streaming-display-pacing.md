# Streaming Display Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assistant text streaming feel smoother without changing SSE ingestion or store truth.

**Architecture:** Keep raw content updates in the store exactly as they arrive. Add a small display-layer pacing helper and hook so `MessageBubble` can progressively reveal assistant text while instantly aligning on content replacement or completion.

**Tech Stack:** React 18, TypeScript, Vite, local Node/tsx tests.

## Global Constraints

- Do not buffer or drop SSE deltas in `useStreamingMessage`.
- Do not change `APPEND_MESSAGE_CONTENT` store semantics.
- Do not apply pacing to user messages, tool rows, or thinking blocks.
- Avoid the prior global `requestAnimationFrame` delta buffer pattern that caused large chunk jumps.
- Verify with focused helper tests, web typecheck, and full build.

---

## File Structure

- `web/src/lib/streamingDisplay.ts`: pure helper that computes the next displayed text from current displayed text and latest source text.
- `web/src/lib/streamingDisplay.test.mjs`: focused regression tests for gradual catch-up and instant reset on replacement.
- `web/src/components/chat/MessageBubble.tsx`: uses the helper for assistant text rendering only.

---

### Task 1: Add Assistant Text Display Pacing

**Files:**
- Create: `web/src/lib/streamingDisplay.ts`
- Create: `web/src/lib/streamingDisplay.test.mjs`
- Modify: `web/src/components/chat/MessageBubble.tsx`

**Interfaces:**
- Consumes: full source assistant text from `message.content` / text parts.
- Produces: display text that catches up in small increments while preserving exact final content.

- [x] **Step 1: Write failing helper tests**

Create tests that assert:

```ts
nextStreamingDisplay("hello", "hello world") === "hello wor"
nextStreamingDisplay("hello world", "replacement") === "replacement"
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/lib/streamingDisplay.test.mjs
```

Expected: fails because `web/src/lib/streamingDisplay.ts` does not exist yet.

- [x] **Step 3: Implement pure helper**

Implement `nextStreamingDisplay(displayed, source, chunkSize = 4)`:

```ts
export function nextStreamingDisplay(displayed: string, source: string, chunkSize = 4) {
  if (!source.startsWith(displayed)) return source
  if (displayed.length >= source.length) return source
  const remaining = source.length - displayed.length
  const step = remaining > 120 ? Math.max(chunkSize, Math.ceil(remaining / 8)) : chunkSize
  return source.slice(0, Math.min(source.length, displayed.length + step))
}
```

- [x] **Step 4: Wire helper into assistant MessageBubble**

Use local state for assistant display text. On source text changes, advance every ~20ms until caught up. If source no longer starts with displayed text, immediately replace.

- [x] **Step 5: Run focused tests**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/lib/streamingDisplay.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/lib/messageOrder.test.mjs
```

Expected: both pass.

- [x] **Step 6: Run verification**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run typecheck -w web
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run build
```

Expected: both pass.
