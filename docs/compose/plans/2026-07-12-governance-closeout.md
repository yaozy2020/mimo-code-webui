# Governance Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified runtime, backup, deployment-transaction, and release-provenance gaps remaining after the six-stage production governance baseline.

**Architecture:** Deliver four sequential, independently reviewable gates. Keep runtime fixes inside existing message/local-run boundaries, enforce backup ownership in deployment scripts and units, extend the existing transactional installer rather than replacing it, and make formal release provenance and MiMo compatibility fail before any service mutation.

**Tech Stack:** React 18, TypeScript, Express, Node.js test scripts, Bash/systemd, OpenSSL Ed25519, npm workspaces.

## Global Constraints

- Existing completed governance is not reopened.
- Keep SSE/store deltas exact and unbuffered.
- Do not add reverse-proxy subpath support; document root-path-only support.
- Do not restart or stop the user's live WebUI unless explicitly requested.
- Do not push commits or publish a release without explicit user instruction.
- Every production change begins with a focused failing test and ends with `npm run verify`.
- Keep G1, G2, G3, and G4 as separate review and commit boundaries.

---

### Task 1: Gate G1 Runtime Reliability

**Covers:** [S1, S2, S3, S7]

**Files:**
- Modify: `web/src/lib/streamingDisplay.ts`
- Modify: `web/src/lib/streamingDisplay.test.mjs`
- Modify: `web/src/components/chat/usePromptController.ts`
- Modify: `web/src/components/chat/localRunSafety.test.mjs`
- Modify: `web/src/stores/appStore.tsx`
- Modify: `web/src/stores/appReducers.ts`
- Modify: `web/src/stores/appReducers.test.mjs`
- Modify: `web/src/api/client.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/app.test.mjs`
- Modify: `server/src/localRunDisconnect.test.mjs`

**Interfaces:**
- Consumes: existing `nextStreamingDisplay(displayed, source, chunkSize?)`, optimistic message actions, `streamLocalRun(...)`, and `/local-run/stream` SSE frames.
- Produces: bounded streaming display; one canonical local-run prompt string; explicit optimistic-send failure reconciliation; terminal `{ type: "error", error: string }` timeout frames; fallback only for an explicit unsupported-streaming error classification.

- [ ] **Step 1: Preserve the current streaming fix as a focused red-green change**

Keep the tests that assert a 64-code-unit maximum frame, an 8,000-character catch-up within 160 frames, and no split surrogate pair. Run:

```bash
node --import tsx web/src/lib/streamingDisplay.test.mjs
```

Expected: PASS on the current working tree. Before committing, use `git show HEAD:web/src/lib/streamingDisplay.ts` in a temporary comparison or review the existing recorded RED result to confirm the old implementation advances 1,000 characters for an 8,000-character backlog.

- [ ] **Step 2: Write failing local-run prompt composition tests**

Add cases to `localRunSafety.test.mjs` covering:

```js
assert.equal(buildLocalRunPrompt("question", [{ filename: "notes.txt", content: "facts" }]), "question\n\n[Attachment: notes.txt]\nfacts")
assert.equal(buildLocalRunPrompt("", [{ filename: "notes.txt", content: "facts" }]), "[Attachment: notes.txt]\nfacts")
assert.equal((buildLocalRunPrompt("question", [{ filename: "notes.txt", content: "facts" }]).match(/facts/g) ?? []).length, 1)
```

Run: `node web/src/components/chat/localRunSafety.test.mjs`

Expected: FAIL because the current `text || ...` path omits attachments when text exists and duplicates attachment content when text is empty.

- [ ] **Step 3: Implement one canonical prompt builder**

Add a small exported helper beside the controller logic:

```ts
export function buildLocalRunPrompt(text: string, attachments: AttachmentInput[]) {
  return [text.trim(), ...attachments.map((file) => `[Attachment: ${file.filename}]\n${file.content}`)]
    .filter(Boolean)
    .join("\n\n")
}
```

Pass only this string to both streaming and non-streaming local-run calls. Do not append attachment content again in `promptParts`.

- [ ] **Step 4: Write failing optimistic failure tests**

In reducer tests, create an optimistic user message, dispatch the new failure action, and assert it is no longer treated as a successful pending message. Use the minimal existing-state representation: remove the optimistic message rather than introducing a new persistent error schema unless current UI already has a retryable error type.

Run: `node --import tsx web/src/stores/appReducers.test.mjs`

Expected: FAIL because no failure reconciliation action exists.

- [ ] **Step 5: Reconcile native send failures**

Add an action with a narrow payload:

```ts
type PromptFailedAction = { type: "PROMPT_FAILED"; sessionId: string; messageId: string }
```

Remove only the matching optimistic message. In the native `prompt_async` catch path, dispatch it before surfacing the existing error. Never remove server-confirmed messages.

- [ ] **Step 6: Write failing timeout and fallback-classification tests**

Add server coverage asserting timeout writes exactly one error frame before EOF. Add frontend coverage asserting generic network/provider errors do not invoke non-streaming fallback, while a typed `STREAM_UNSUPPORTED` response does.

Run:

```bash
node --import tsx server/src/app.test.mjs
node web/src/components/chat/localRunSafety.test.mjs
```

Expected: FAIL because aborted timeout currently ends silently and all pre-delta failures fall back.

- [ ] **Step 7: Implement explicit timeout and narrow fallback**

Track timeout separately from client disconnect:

```ts
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  abort.abort()
}, LOCAL_RUN_TIMEOUT_MS)
```

When `timedOut && !res.writableEnded`, emit `{ type: "error", error: "Local run timed out" }`. Preserve silent handling for actual client disconnect. In the frontend, retry non-streaming only when the API error code is `STREAM_UNSUPPORTED`.

- [ ] **Step 8: Verify and review G1**

Run:

```bash
node --import tsx web/src/lib/streamingDisplay.test.mjs
node web/src/components/chat/localRunSafety.test.mjs
node --import tsx web/src/stores/appReducers.test.mjs
node --import tsx server/src/app.test.mjs
node --import tsx server/src/localRunDisconnect.test.mjs
npm run verify
git diff --check
```

Expected: all commands exit 0. Request an independent code review. Do not restart the live service.

- [ ] **Step 9: Commit G1 after explicit commit approval**

```bash
git add web/src/lib/streamingDisplay.ts web/src/lib/streamingDisplay.test.mjs web/src/components/chat/usePromptController.ts web/src/components/chat/localRunSafety.test.mjs web/src/stores/appStore.tsx web/src/stores/appReducers.ts web/src/stores/appReducers.test.mjs web/src/api/client.ts server/src/app.ts server/src/app.test.mjs server/src/localRunDisconnect.test.mjs
git commit -m "fix: harden streaming and prompt delivery"
```

### Task 2: Gate G2 Backup Ownership Safety

**Covers:** [S1, S2, S4, S7]

**Files:**
- Modify: `deploy/mimo-code-webui`
- Modify: `deploy/systemd/mimo-code-webui-backup.service`
- Modify: `scripts/backup-state.sh`
- Modify: `scripts/backup-state.test.mjs`
- Modify: `scripts/deployment.test.mjs`
- Modify: `scripts/deployment-sandbox.test.mjs`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: `/etc/mimo-code-webui/webui.env`, `MIMO_REUSE_EXISTING`, existing backup lock and manifest flow.
- Produces: opt-in backup timer; preflight refusal for external MiMo reuse; a runtime state marker that restarts WebUI only when backup stopped an active service.

- [ ] **Step 1: Write failing timer opt-in and reuse-refusal tests**

Assert the installer enables the main unit but does not enable `mimo-code-webui-backup.timer`. Add a backup-state test with `MIMO_REUSE_EXISTING=true` expecting a nonzero exit before service stop or filesystem copy.

Run:

```bash
node scripts/deployment.test.mjs
node scripts/backup-state.test.mjs
```

Expected: FAIL on unconditional timer enablement and missing reuse guard.

- [ ] **Step 2: Make scheduling explicitly opt-in**

Remove unconditional timer enablement from install/upgrade. Print the exact operator command after healthy installation:

```text
systemctl enable --now mimo-code-webui-backup.timer
```

State that it is valid only when the service owns all MiMo writers. Update `docs/deployment.md` to match executable behavior.

- [ ] **Step 3: Reject backup with external MiMo reuse**

Load the root-only environment file through the existing parser and fail before mutation when:

```bash
MIMO_REUSE_EXISTING=true
```

Return a stable message: `backup requires WebUI-owned MiMo processes; MIMO_REUSE_EXISTING=true`.

- [ ] **Step 4: Write failing service-state preservation tests**

Extend the sandbox harness with active and inactive initial states. Assert active is stopped and restored, inactive remains inactive, and failed backup restores only a service the operation stopped.

Run: `node scripts/deployment-sandbox.test.mjs`

Expected: FAIL because `ExecStopPost` currently starts the main service unconditionally.

- [ ] **Step 5: Preserve pre-backup state**

Use a root-only runtime marker under `/run/mimo-code-webui/backup-restart-required`. `ExecStartPre` records the marker only after confirming the main service is active; backup stops it. `ExecStopPost` invokes a narrow helper that starts the service only when the marker exists, then removes the marker. Do not infer prior state from backup success.

- [ ] **Step 6: Verify and review G2**

Run:

```bash
node scripts/backup-state.test.mjs
node scripts/deployment.test.mjs
node scripts/deployment-sandbox.test.mjs
npm run verify
git diff --check
```

Expected: all commands exit 0. Request independent review focused on data consistency and systemd failure paths.

- [ ] **Step 7: Commit G2 after explicit commit approval**

```bash
git add deploy/mimo-code-webui deploy/systemd/mimo-code-webui-backup.service scripts/backup-state.sh scripts/backup-state.test.mjs scripts/deployment.test.mjs scripts/deployment-sandbox.test.mjs docs/deployment.md
git commit -m "fix(ops): enforce backup ownership boundaries"
```

### Task 3: Gate G3 Deployment Transaction Integrity

**Covers:** [S1, S2, S5, S7]

**Files:**
- Modify: `deploy/mimo-code-webui`
- Modify: `scripts/deployment-sandbox.test.mjs`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: existing deployment lock, transaction trap, current-release symlink, backup command, health poller.
- Produces: one preflight transaction state containing prior release and prior service activity; deterministic compensation before candidate mutation.

- [ ] **Step 1: Write failing post-backup recovery tests**

Inject a failure when restarting the old service after the pre-upgrade backup. Assert candidate extraction and symlink switch never occur, current release remains unchanged, and the command exits nonzero with `old release failed to recover after pre-upgrade backup`.

Add a second case where the service was inactive before upgrade and remains inactive after preflight.

Run: `node scripts/deployment-sandbox.test.mjs`

Expected: FAIL because the current `set -e` path exits before transaction compensation is armed.

- [ ] **Step 2: Arm compensation before stopping the old service**

Capture:

```bash
PREVIOUS_RELEASE=$(readlink -f "$CURRENT_LINK")
SERVICE_WAS_ACTIVE=false
systemctl is-active --quiet "$SERVICE" && SERVICE_WAS_ACTIVE=true
TRANSACTION_ACTIVE=true
```

Set these before pre-upgrade backup stops the service. Keep candidate paths unset until verification and extraction begin.

- [ ] **Step 3: Restore only the prior state**

On preflight failure, retain the prior release link and environment. If `SERVICE_WAS_ACTIVE=true`, start and poll health; otherwise leave the service inactive. Return a distinct nonzero status even when compensation succeeds.

- [ ] **Step 4: Verify and review G3**

Run:

```bash
node scripts/deployment.test.mjs
node scripts/deployment-sandbox.test.mjs
npm run verify
git diff --check
```

Expected: all commands exit 0. Review must inspect every command between transaction activation and trap cleanup.

- [ ] **Step 5: Commit G3 after explicit commit approval**

```bash
git add deploy/mimo-code-webui scripts/deployment-sandbox.test.mjs docs/deployment.md
git commit -m "fix(ops): preserve deployment transaction state"
```

### Task 4: Gate G4 Release Provenance and MiMo Compatibility

**Covers:** [S1, S2, S6, S7]

**Files:**
- Modify: `package.json`
- Modify: `scripts/package-release.mjs`
- Modify: `scripts/deployment.test.mjs`
- Modify: `deploy/mimo-code-webui`
- Modify: `server/src/cliCommands.ts` or the existing MiMo version parser owner identified during implementation
- Modify: the corresponding existing `*.test.mjs`
- Modify: `docs/deployment.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: package version, Git branch/tag/HEAD, `RELEASE_SIGNING_KEY`, `mimo --version`, MiMo health/protocol endpoints.
- Produces: strict `package:release`; explicit `package:unsigned` for development; `check_release_provenance()`; `check_mimo_compatibility()` before installer mutation.

- [ ] **Step 1: Write failing formal-release provenance tests**

Use temporary Git repositories to cover missing signing key, dirty tracked tree, wrong branch, missing tag, lightweight tag, tag/version mismatch, tag not at HEAD, and a valid annotated `v<package-version>` tag at HEAD.

Run the focused packaging test command defined in `package.json`.

Expected: FAIL because packaging currently succeeds without a key and does not validate Git provenance.

- [ ] **Step 2: Split formal and development packaging**

Define:

```json
"package:release": "node scripts/package-release.mjs --release",
"package:unsigned": "node scripts/package-release.mjs --unsigned"
```

`--release` requires the protected key, approved branch, clean tracked tree, annotated/signed matching tag at HEAD, and writes commit/version metadata. `--unsigned` writes an `.unsigned` artifact name and never emits a `.sig`, so the installer rejects it naturally.

- [ ] **Step 3: Write failing MiMo compatibility tests**

Determine the minimum version from the oldest real version already exercised by the project evidence, then pin it in one constant. Test missing binary, unparsable output, one version below minimum, minimum version, newer version, failed health probe, and missing required protocol endpoint.

Expected: installer tests FAIL because only executable presence is checked.

- [ ] **Step 4: Implement compatibility preflight before mutation**

Parse semver conservatively from `mimo --version`. Reject unknown formats rather than guessing. Probe the required health endpoint and a read-only protocol endpoint already used by the WebUI; use bounded timeouts and do not create sessions. Run this check before backup, service stop, extraction, or symlink mutation.

- [ ] **Step 5: Document supported deployment contract**

Document the minimum MiMo version, preflight behavior, formal signed release command, development unsigned command, approved release branch, and root-path-only reverse-proxy support. Do not claim subpath compatibility.

- [ ] **Step 6: Verify and review G4**

Run:

```bash
node scripts/deployment.test.mjs
node scripts/deployment-sandbox.test.mjs
npm run verify
git diff --check
```

Create a temporary signed candidate with a temporary Ed25519 key outside the repository and verify signature, outer SHA-256, and inner manifest. Do not use or expose the production private key during routine tests.

- [ ] **Step 7: Commit G4 after explicit commit approval**

```bash
git add package.json scripts/package-release.mjs scripts/deployment.test.mjs deploy/mimo-code-webui server/src docs/deployment.md README.md
git commit -m "feat(ops): enforce release and MiMo compatibility gates"
```

### Task 5: Final Evidence and Closeout

**Covers:** [S1, S2, S3, S4, S5, S6, S7]

**Files:**
- Create: `docs/compose/reports/governance-closeout.md`
- Modify: `docs/compose/plans/2026-07-12-governance-closeout.md`

**Interfaces:**
- Consumes: G1-G4 commits, review findings, verification logs, signed candidate evidence, and optional user-authorized LAN browser evidence.
- Produces: one auditable final report with requirement-to-evidence mapping and explicit external constraints.

- [ ] **Step 1: Run the final non-disruptive gate**

```bash
npm run verify
npm audit --omit=dev
git diff --check
git status --short --branch
```

Expected: verification exits 0, production audit has no unresolved high/critical vulnerability, diff check exits 0, and status contains only intentional report/plan changes.

- [ ] **Step 2: Run authorized runtime evidence only when requested**

After the user explicitly requests a restart, use the existing safe local restart mechanism and verify through `http://192.168.10.236:8090/`: long native streaming, sticky upward scroll, local-run textual attachment exactly once, native send failure cleanup, timeout visibility, cancellation, workspace switching, and authentication. If no restart is authorized, mark this evidence `BLOCKED: awaiting user-controlled restart`; do not weaken completion claims.

- [ ] **Step 3: Write the final report**

Record each spec anchor, commit, command, outcome, and remaining external constraint. Keep actor `turnCount: 0`, production-key offline copy, root-path-only proxying, and fixed systemd layout clearly separated from completed code work.

- [ ] **Step 4: Independent final review**

Review the full range from the pre-G1 base through G4. Fix every Critical and Important finding with a new red-green cycle, rerun `npm run verify`, and update the report.

- [ ] **Step 5: Commit documentation after explicit commit approval**

```bash
git add docs/compose/specs/2026-07-12-governance-closeout-design.md docs/compose/plans/2026-07-12-governance-closeout.md docs/compose/reports/governance-closeout.md
git commit -m "docs: record governance closeout evidence"
```

- [ ] **Step 6: Publication remains a separate user gate**

Do not push or create a release automatically. On explicit instruction, push the reviewed commits, create the next patch tag, produce the signed artifact with the production key through hidden local credentials, upload `.tar.gz`, `.sha256`, and `.sig`, then independently download and verify all three.
