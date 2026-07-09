# Post-Audit Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert MiMo Code WebUI from a local-source deployment into a safer, maintainable, third-party deployable product baseline.

**Architecture:** Treat governance as five independently reviewable slices: portability blockers, safe network defaults, workspace/config boundaries, release packaging, and maintainability guardrails. Each slice must ship with focused tests or executable smoke checks before moving on. Do not combine refactors with security behavior changes unless the task explicitly requires extracting a test seam.

**Tech Stack:** npm workspaces, Node.js 18+, Express, TypeScript, React 18, Vite, Bash, Windows batch, MiMo Code CLI.

## Global Constraints

- Do not remove current user-facing chat behavior while hardening deployment and security.
- Do not commit unless the user explicitly asks for a commit.
- Do not store or print real API keys, auth tokens, or user secrets in docs, tests, logs, or fixtures.
- Use `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH"` for Node/npm commands in this environment.
- Use `npm run verify` as the final repository verification gate after every task that changes code.
- Keep `/status` public enough for auth discovery, but do not expose detailed paths, config, process IDs, or provider details without authentication.
- For deployment scripts, do not hard-code personal paths such as `/home/yzy`.
- For workspace directory routing, allow only resolved paths inside `MIMO_WORKSPACE_ROOT` unless an explicit allowlist is configured.
- Prefer small targeted edits and tests over broad rewrites.

---

## File Structure

- `scripts/start.sh`: Linux startup preflight, default HOME handling, build checks, final URL output.
- `scripts/start.bat`: Windows startup preflight and dist checks aligned with Linux.
- `scripts/mimo-watchdog.sh`: optional MiMo watchdog without personal HOME defaults.
- `README.md`: user-facing deployment, configuration, security, release, and migration instructions.
- `server/src/index.ts`: production startup policy, auth requirement decision, legacy config migration call.
- `server/src/app.ts`: Express app routes, public/minimal status, authenticated diagnostics endpoint, local route protections.
- `server/src/app.test.mjs`: HTTP-level tests for auth, public status, diagnostics, local routes, and workspace policy.
- `server/src/config.ts`: MiMo config path migration, OpenAI-compatible base URL validation, optional DNS-aware SSRF guard.
- `server/src/config.test.mjs`: config path, migration, and unsafe base URL regression tests.
- `server/src/workspacePolicy.ts`: new focused module that validates requested workspace directories.
- `server/src/workspacePolicy.test.mjs`: path traversal, symlink escape, root allow, and missing directory tests.
- `server/src/mimoSupervisor.ts`: extraction target for MiMo process lifecycle.
- `server/src/mimoSupervisor.test.mjs`: fake-process/fake-health supervisor tests.
- `web/src/stores/appStore.tsx`: temporary integration point while reducer behavior is extracted.
- `web/src/stores/appReducers.ts`: new pure reducer module for sessions, messages, settings, and runtime queues.
- `web/src/stores/appReducers.test.mjs`: reducer tests for message merge, settings persistence boundaries, and session ownership.
- `web/src/components/chat/ChatArea.tsx`: temporary integration point while hooks are extracted.
- `web/src/components/chat/useActiveSessionData.ts`: new hook for message/todo/diff loading and polling.
- `web/src/components/chat/usePromptController.ts`: new hook for native/local-run send routing and optimistic messages.
- `web/src/components/chat/usePromptController.test.mjs`: focused send/fallback behavior tests.
- `scripts/package-release.mjs`: new release zip/tarball packaging script.
- `docs/operations.md`: operational runbook for config paths, ports, auth, MiMo CLI, and troubleshooting.
- `docs/testing.md`: verification commands and smoke test expectations.
- `docs/architecture.md`: stable architecture map replacing historical compose-plan facts as source of truth.

---

## Governance Milestones

| Milestone | Purpose | Exit Criteria |
|:--|:--|:--|
| M0 | Remove deployment blockers | Linux/Windows scripts no longer assume author machine paths; config path docs match code. |
| M1 | Safe default exposure | LAN binding requires auth or explicit unsafe override; public status is minimal. |
| M2 | Bound workspace/config attack surface | Directory routing and provider base URLs have tested server-side policy. |
| M3 | Third-party release | A release archive can be built and smoke-tested without source rebuild. |
| M4 | Maintainability guardrails | Core state, prompt orchestration, and MiMo process lifecycle have focused boundaries and tests. |

---

### Task 1: Portable Startup And Config Path Truth

**Covers:** M0

**Files:**
- Modify: `scripts/start.sh:9-88`
- Modify: `scripts/start.bat:9-33`
- Modify: `scripts/mimo-watchdog.sh`
- Modify: `server/src/index.ts:1-240`
- Modify: `server/src/config.ts:57-104`
- Modify: `server/src/config.test.mjs`
- Modify: `README.md:22-140`
- Create: `docs/operations.md`

**Interfaces:**
- Consumes: existing `migrateLegacyMimoConfig(): void`, `getMimoConfigPath(): string`, `getLegacyMimoConfigPath(): string` from `server/src/config.ts`.
- Produces: startup behavior that uses the caller's real HOME unless `MIMO_HOME` is explicitly set; a documented primary config path of `~/.config/mimocode/config.json`.

- [ ] **Step 1: Write failing config migration test**

Add this case to `server/src/config.test.mjs` before the final `console.log`:

```js
  const legacyDir = path.join(tempDir, "legacy")
  const legacyPath = path.join(legacyDir, "mimo.config.json")
  process.env.MIMO_LEGACY_CONFIG_PATH = legacyPath
  fs.rmSync(configPath, { force: true })
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(legacyPath, JSON.stringify({ provider: { legacy: { models: { model: { name: "Legacy" } } } } }), "utf-8")

  migrateLegacyMimoConfig()
  const migrated = JSON.parse(fs.readFileSync(configPath, "utf-8"))
  assert.equal(migrated.provider.legacy.models.model.name, "Legacy")
```

Also update the import:

```js
import { addMimoModelConfig, migrateLegacyMimoConfig, resolveOpenAICompatibleModel } from "./config.ts"
```

- [ ] **Step 2: Run config test to verify it fails**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/config.test.mjs`

Expected: FAIL because `MIMO_LEGACY_CONFIG_PATH` is not supported yet.

- [ ] **Step 3: Add testable legacy config path override**

In `server/src/config.ts`, change `getLegacyMimoConfigPath()` to:

```ts
export function getLegacyMimoConfigPath(): string {
  if (process.env.MIMO_LEGACY_CONFIG_PATH) {
    return process.env.MIMO_LEGACY_CONFIG_PATH
  }
  const home = os.homedir()
  return path.join(home, ".mimo", "mimo.config.json")
}
```

- [ ] **Step 4: Call migration during startup**

In `server/src/index.ts`, call migration at the beginning of `main()` before reading config-dependent state:

```ts
async function main() {
  migrateLegacyMimoConfig()
  const port = await findAvailablePort(PREFERRED_PORT, HOST, PORT_EXPLICITLY_SET)
```

- [ ] **Step 5: Remove personal HOME default from Linux startup**

Replace `scripts/start.sh:9-16` with:

```bash
# Use the invoking user's HOME by default. Set MIMO_HOME only when a service
# account must intentionally share a different MiMo config/state directory.
if [ -n "${MIMO_HOME:-}" ]; then
  export HOME="$MIMO_HOME"
fi
export MIMO_CONFIG_PATH="${MIMO_CONFIG_PATH:-$HOME/.config/mimocode/config.json}"
export MIMO_WORKSPACE_ROOT="${MIMO_WORKSPACE_ROOT:-$(dirname "$PROJECT_DIR")}" 
```

- [ ] **Step 6: Add npm preflight to Linux startup**

After the Node executable check in `scripts/start.sh`, add:

```bash
if ! command -v npm &> /dev/null; then
  echo "Error: npm is not available in PATH. Install npm or use a prebuilt release package."
  exit 1
fi

echo "[start] using npm: $(command -v npm)"
```

- [ ] **Step 7: Align Windows dist checks**

Replace `scripts/start.bat:15-25` with:

```bat
if not exist "node_modules\*" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "web\node_modules\*" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "server\node_modules\*" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "web\dist\*" (
  echo Building project...
  call npm run build
  if errorlevel 1 exit /b 1
)

if not exist "server\dist\index.js" (
  echo Building project...
  call npm run build
  if errorlevel 1 exit /b 1
)
```

- [ ] **Step 8: Remove personal HOME from watchdog**

In `scripts/mimo-watchdog.sh`, replace any hard-coded `/home/yzy` defaults with:

```bash
if [ -n "${MIMO_HOME:-}" ]; then
  export HOME="$MIMO_HOME"
fi
export MIMO_CONFIG_PATH="${MIMO_CONFIG_PATH:-$HOME/.config/mimocode/config.json}"
```

- [ ] **Step 9: Document current config path and migration**

Add `docs/operations.md` with:

```markdown
# Operations

## Runtime Requirements

- Node.js 18+
- npm
- MiMo Code CLI available as `mimo` on `PATH`

## Configuration Paths

The primary MiMo config path is `~/.config/mimocode/config.json`.

On startup, the server migrates a readable legacy `~/.mimo/mimo.config.json` into the primary path only when the primary path is missing or empty.

Use `MIMO_CONFIG_PATH=/path/to/config.json` to override the config file.
Use `MIMO_HOME=/path/to/home` only when a service account intentionally needs a different MiMo home directory.

## Ports

The WebUI backend defaults to `HOST=0.0.0.0` and `PORT=8080` until the safe network defaults task changes this behavior.
The managed MiMo serve process defaults to `MIMO_HOST=127.0.0.1` and `MIMO_PORT=4096`.
```

- [ ] **Step 10: Update README quick start**

Change README configuration text to point to `docs/operations.md` and state that `~/.config/mimocode/config.json` is the primary path. Remove the example that makes `~/.mimo/mimo.config.json` look like the preferred path.

- [ ] **Step 11: Verify Task 1**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/config.test.mjs
bash -n scripts/start.sh
bash -n scripts/mimo-watchdog.sh
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all commands pass.

---

### Task 2: Safe Network Defaults And Minimal Public Status

**Covers:** M1

**Files:**
- Modify: `server/src/index.ts:14-22`
- Modify: `server/src/app.ts:64-82`
- Modify: `server/src/app.test.mjs`
- Modify: `README.md`
- Modify: `docs/operations.md`

**Interfaces:**
- Consumes: `createApp(options)` from `server/src/app.ts`.
- Produces: startup policy that refuses unauthenticated non-loopback exposure unless `ALLOW_UNAUTHENTICATED_LAN=true`; authenticated detailed status endpoint at `GET /local-status`.

- [ ] **Step 1: Write failing route tests**

In `server/src/app.test.mjs`, add checks after the existing `/status` assertion:

```js
  const statusJson = JSON.parse(statusBody)
  assert.equal(typeof statusJson.authRequired, "boolean")
  assert.equal(statusJson.mimo.healthy, true)
  assert.equal("workspaceRoot" in statusJson.mimo, false, "public /status should not expose workspaceRoot")
  assert.equal("projectServers" in statusJson.mimo, false, "public /status should not expose managed project servers")
  assert.equal("config" in statusJson, false, "public /status should not expose config summary")

  const unauthenticatedLocalStatus = await fetch(`${url}/local-status`)
  assert.equal(unauthenticatedLocalStatus.status, 401, "/local-status should require auth")

  const authenticatedLocalStatus = await fetch(`${url}/local-status`, {
    headers: { Authorization: "Bearer secret-token" },
  })
  assert.equal(authenticatedLocalStatus.status, 200)
  const authenticatedLocalStatusBody = await authenticatedLocalStatus.text()
  assert.equal(authenticatedLocalStatusBody.includes("workspaceRoot"), true)
  assert.equal(authenticatedLocalStatusBody.includes("sk-secret"), false)
```

- [ ] **Step 2: Run route test to verify it fails**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/app.test.mjs`

Expected: FAIL because public `/status` still exposes detailed fields and `/local-status` does not exist.

- [ ] **Step 3: Add shared status body helper**

In `server/src/app.ts`, create this helper inside `createApp()` above the status routes:

```ts
  const createDetailedStatus = async (req: Request) => {
    const health = await options.checkHealth(options.mimoInfo.url)
    const pathInfo = health.healthy ? await options.getMimoPathInfo(options.mimoInfo.url) : null
    const hostHeader = req.headers.host || `${options.host}:${options.port}`
    return {
      webui: { port: options.port, host: options.host, url: `http://${hostHeader}` },
      mimo: {
        ...options.mimoInfo,
        healthy: health.healthy,
        version: health.version,
        managed: options.isMimoManaged(),
        workspaceRoot: options.workspaceRoot,
        projectServers: options.listManagedMimoServers(),
        path: pathInfo,
      },
      config: createPublicConfigSummary(options.readMimoConfig()),
      authRequired: !!options.authToken,
    }
  }
```

- [ ] **Step 4: Minimize public status and add authenticated diagnostics**

Replace the existing `/status` route with:

```ts
  app.get("/status", async (_req, res) => {
    const health = await options.checkHealth(options.mimoInfo.url)
    res.json({
      webui: { port: options.port, host: options.host },
      mimo: { healthy: health.healthy, version: health.version },
      authRequired: !!options.authToken,
    })
  })

  app.get("/local-status", authMiddleware, async (req, res) => {
    res.json(await createDetailedStatus(req))
  })
```

- [ ] **Step 5: Add safe LAN startup policy**

In `server/src/index.ts`, add:

```ts
const ALLOW_UNAUTHENTICATED_LAN = process.env.ALLOW_UNAUTHENTICATED_LAN === "true"

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1"
}

function assertSafeAuthPolicy() {
  if (!AUTH_TOKEN && !ALLOW_UNAUTHENTICATED_LAN && !isLoopbackHost(HOST)) {
    throw new Error("AUTH_TOKEN is required when HOST is not loopback. Set AUTH_TOKEN or use HOST=127.0.0.1. For local trusted LAN testing only, set ALLOW_UNAUTHENTICATED_LAN=true.")
  }
}
```

Then call it at the top of `main()` after Task 1's migration call:

```ts
  migrateLegacyMimoConfig()
  assertSafeAuthPolicy()
```

- [ ] **Step 6: Document safe defaults**

In README and `docs/operations.md`, document:

```markdown
For LAN access, set `AUTH_TOKEN` before binding to `0.0.0.0`.

```bash
AUTH_TOKEN=replace-with-a-random-token HOST=0.0.0.0 ./scripts/start.sh
```

Unauthenticated LAN mode is only for trusted temporary testing:

```bash
ALLOW_UNAUTHENTICATED_LAN=true HOST=0.0.0.0 ./scripts/start.sh
```
```

- [ ] **Step 7: Verify Task 2**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/app.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all commands pass.

---

### Task 3: Workspace Directory Policy

**Covers:** M2

**Files:**
- Create: `server/src/workspacePolicy.ts`
- Create: `server/src/workspacePolicy.test.mjs`
- Modify: `server/src/mimo.ts:30-40`
- Modify: `server/src/index.ts:62-65`
- Modify: `server/src/app.ts`
- Modify: `server/src/app.test.mjs`
- Modify: `package.json:16`

**Interfaces:**
- Produces: `validateWorkspaceDirectory(input: string, root: string): string` that returns a resolved real path inside root or throws.
- Consumes: `MIMO_WORKSPACE_ROOT` from `server/src/index.ts` and optional `directory` query values from requests.

- [ ] **Step 1: Write failing workspace policy test**

Create `server/src/workspacePolicy.test.mjs`:

```js
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { validateWorkspaceDirectory } from "./workspacePolicy.ts"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-workspace-policy-"))
const root = path.join(tempDir, "root")
const project = path.join(root, "project")
const outside = path.join(tempDir, "outside")
fs.mkdirSync(project, { recursive: true })
fs.mkdirSync(outside, { recursive: true })

try {
  assert.equal(validateWorkspaceDirectory(project, root), fs.realpathSync(project))
  assert.throws(() => validateWorkspaceDirectory(outside, root), /outside workspace root/i)
  assert.throws(() => validateWorkspaceDirectory(path.join(root, "missing"), root), /does not exist/i)

  const symlink = path.join(root, "link-out")
  try {
    fs.symlinkSync(outside, symlink, "dir")
    assert.throws(() => validateWorkspaceDirectory(symlink, root), /outside workspace root/i)
  } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error
  }

  console.log("workspace policy tests passed")
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run workspace policy test to verify it fails**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/workspacePolicy.test.mjs`

Expected: FAIL because `server/src/workspacePolicy.ts` does not exist.

- [ ] **Step 3: Implement workspace policy**

Create `server/src/workspacePolicy.ts`:

```ts
import fs from "node:fs"
import path from "node:path"

function assertDirectory(directory: string) {
  try {
    if (fs.statSync(directory).isDirectory()) return
  } catch {
    throw new Error(`Workspace directory does not exist: ${directory}`)
  }
  throw new Error(`Workspace path is not a directory: ${directory}`)
}

export function validateWorkspaceDirectory(input: string, root: string): string {
  const resolvedRoot = fs.realpathSync(path.resolve(root))
  const resolvedInput = path.resolve(input)
  assertDirectory(resolvedInput)
  const realInput = fs.realpathSync(resolvedInput)
  const relative = path.relative(resolvedRoot, realInput)
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return realInput
  }
  throw new Error(`Workspace directory is outside workspace root: ${input}`)
}
```

- [ ] **Step 4: Use policy in MiMo process manager**

In `server/src/mimo.ts`, replace `assertUsableDirectory(directory)` calls in `ensureMimoServerForDirectory()` with validated input. First import:

```ts
import { validateWorkspaceDirectory } from "./workspacePolicy.js"
```

Then change the function signature to accept root:

```ts
export async function ensureMimoServerForDirectory(directory: string, options?: { workspaceRoot?: string; hostname?: string; preferredPort?: number }): Promise<MimoServerInfo> {
  const normalized = validateWorkspaceDirectory(directory, options?.workspaceRoot ?? process.cwd())
```

Keep the rest of the function using `normalized` as the key and `cwd`.

- [ ] **Step 5: Validate directory in proxy target resolution**

In `server/src/index.ts`, update `requestDirectory()` to validate before use:

```ts
function requestDirectory(req: Request): string | undefined {
  const value = req.query.directory
  if (typeof value !== "string" || !value.trim()) return undefined
  return validateWorkspaceDirectory(value.trim(), MIMO_WORKSPACE_ROOT)
}
```

Import `validateWorkspaceDirectory` from `./workspacePolicy.js`.

- [ ] **Step 6: Add route-level rejection test**

In `server/src/app.test.mjs`, pass a proxy handler that returns 200 and add one request against `/api/session?directory=/tmp` after the app factory supports directory policy. If app-level policy is not added in this task, keep this assertion in `workspacePolicy.test.mjs` only and document that proxy-level integration is covered when directory routing is wired.

- [ ] **Step 7: Add workspace test to verify script**

In `package.json`, add `node --import tsx server/src/workspacePolicy.test.mjs` after `server/src/mimo.test.mjs` in `verify`.

- [ ] **Step 8: Verify Task 3**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/workspacePolicy.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all commands pass.

---

### Task 4: Provider Base URL SSRF Hardening

**Covers:** M2

**Files:**
- Modify: `server/src/config.ts:128-205`
- Modify: `server/src/config.test.mjs`
- Modify: `server/src/openaiStream.ts:1-90`
- Modify: `server/src/app.ts:136-169`

**Interfaces:**
- Consumes: existing `validateOpenAIBaseUrl(value: string): string` internal helper.
- Produces: validated HTTPS provider URLs with IP literal blocking, redirect blocking, timeout, and request size boundaries.

- [ ] **Step 1: Add failing config tests for URL forms**

Add these assertions to `server/src/config.test.mjs`:

```js
  assert.throws(
    () => addMimoModelConfig({ providerID: "loopback", modelID: "probe", baseUrl: "https://127.0.0.1/v1" }),
    /baseUrl host is not allowed/i,
  )
  assert.throws(
    () => addMimoModelConfig({ providerID: "ipv6", modelID: "probe", baseUrl: "https://[::1]/v1" }),
    /baseUrl host is not allowed/i,
  )
  assert.equal(
    addMimoModelConfig({ providerID: "public", modelID: "probe", baseUrl: "https://api.example.com/v1/" }).baseUrl,
    "https://api.example.com/v1",
  )
```

- [ ] **Step 2: Run config test**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/config.test.mjs`

Expected: PASS if current IP literal coverage is sufficient; if it fails, fix the validator before proceeding.

- [ ] **Step 3: Disable automatic redirects in OpenAI stream request**

In `server/src/openaiStream.ts`, update the `fetch` call options to include:

```ts
redirect: "error",
```

- [ ] **Step 4: Add request timeout to local-run stream**

In `server/src/app.ts`, replace the abort setup with:

```ts
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 120000)
    req.on("aborted", () => abort.abort())
```

Then clear it in `finally` before `res.end()`:

```ts
      clearTimeout(timeout)
      res.end()
```

- [ ] **Step 5: Add prompt length guard**

In `/local-run` and `/local-run/stream`, after reading `model` and `prompt`, add:

```ts
      if (prompt.length > 200000) {
        res.status(413).json({ error: "prompt is too large" })
        return
      }
```

For `/local-run/stream`, use the same guard before `res.writeHead(200, ...)`.

- [ ] **Step 6: Verify Task 4**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/config.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/app.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all commands pass.

---

### Task 5: Release Package And Third-Party Deployment Path

**Covers:** M3

**Files:**
- Create: `scripts/package-release.mjs`
- Modify: `package.json:11-20`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Create: `docs/testing.md`

**Interfaces:**
- Produces: `npm run package:release` that creates `dist-release/mimo-code-webui-v0.1.0.zip` or `.tar.gz` from built assets.
- Consumes: `npm run build`, `web/dist`, `server/dist`, root `package.json`, `package-lock.json`, `scripts/start.sh`, `scripts/start.bat`, `README.md`, `docs/operations.md`.

- [ ] **Step 1: Create release package script**

Create `scripts/package-release.mjs`:

```js
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"))
const outDir = path.join(root, "dist-release")
const stage = path.join(outDir, `mimo-code-webui-v${pkg.version}`)
const archive = path.join(outDir, `mimo-code-webui-v${pkg.version}.tar.gz`)

function copy(src, dest) {
  fs.cpSync(path.join(root, src), path.join(stage, dest ?? src), { recursive: true })
}

fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

for (const required of ["web/dist", "server/dist", "package.json", "package-lock.json", "README.md"]) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing required release input: ${required}`)
}

copy("web/dist")
copy("server/dist")
copy("package.json")
copy("package-lock.json")
copy("server/package.json")
copy("web/package.json")
copy("scripts/start.sh")
copy("scripts/start.bat")
copy("README.md")
if (fs.existsSync(path.join(root, "docs/operations.md"))) copy("docs/operations.md")
if (fs.existsSync(path.join(root, "docs/testing.md"))) copy("docs/testing.md")

fs.rmSync(archive, { force: true })
const result = spawnSync("tar", ["-czf", archive, "-C", outDir, path.basename(stage)], { stdio: "inherit" })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`[release] wrote ${archive}`)
```

- [ ] **Step 2: Add package script**

In root `package.json`, add:

```json
"package:release": "npm run build && node scripts/package-release.mjs"
```

- [ ] **Step 3: Document deployment paths**

In README, split Quick Start into:

```markdown
## Quick Start From Release Package

1. Install Node.js 18+ and the MiMo Code CLI.
2. Download and extract `mimo-code-webui-v0.1.0.tar.gz`.
3. Start with `./scripts/start.sh` on Linux or `scripts\\start.bat` on Windows.

## Quick Start From Source

```bash
npm install
npm run build
npm start
```
```

- [ ] **Step 4: Add testing docs**

Create `docs/testing.md`:

```markdown
# Testing

Run the full verification gate before release:

```bash
npm run verify
```

Optional browser smoke checks require a running WebUI:

```bash
npm run smoke:browser
npm run smoke:browser:system
```

Browser smoke scripts are runtime diagnostics, not the primary regression suite.
```

- [ ] **Step 5: Verify release packaging**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run package:release
```

Expected: `dist-release/mimo-code-webui-v0.1.0.tar.gz` exists and contains `web/dist`, `server/dist`, `scripts/start.sh`, `scripts/start.bat`, and README.

---

### Task 6: Frontend State And Prompt Orchestration Guardrails

**Covers:** M4

**Files:**
- Create: `web/src/stores/appReducers.ts`
- Create: `web/src/stores/appReducers.test.mjs`
- Modify: `web/src/stores/appStore.tsx`
- Create: `web/src/components/chat/useActiveSessionData.ts`
- Create: `web/src/components/chat/usePromptController.ts`
- Create: `web/src/components/chat/usePromptController.test.mjs`
- Modify: `web/src/components/chat/ChatArea.tsx`
- Modify: `package.json:16`

**Interfaces:**
- Produces: pure reducer helpers for message/session/settings state; hooks that separate active session loading and prompt sending from `ChatArea` rendering.
- Consumes: existing app actions and API clients from `web/src/api`.

- [ ] **Step 1: Extract message reducer test first**

Create `web/src/stores/appReducers.test.mjs`:

```js
import assert from "node:assert/strict"
import { applyMessages, appendMessageContent, setMessageContent } from "./appReducers.ts"

const sessionID = "s1"
const initial = { [sessionID]: [{ id: "m1", sessionID, role: "assistant", content: "hel", time: { created: 1 } }] }

assert.equal(appendMessageContent(initial, sessionID, "m1", "lo")[sessionID][0].content, "hello")
assert.equal(setMessageContent(initial, sessionID, "m1", "done")[sessionID][0].content, "done")
const merged = applyMessages(initial, sessionID, [{ id: "m2", sessionID, role: "user", content: "new", time: { created: 2 } }])
assert.deepEqual(merged[sessionID].map((m) => m.id), ["m1", "m2"])

console.log("app reducer tests passed")
```

- [ ] **Step 2: Run reducer test to verify it fails**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/stores/appReducers.test.mjs`

Expected: FAIL because `appReducers.ts` does not exist.

- [ ] **Step 3: Extract pure message helpers**

Create `web/src/stores/appReducers.ts` with pure functions copied from current reducer logic:

```ts
import { orderMessages } from "@/lib/messageOrder"
import type { Message } from "@/types"

export function applyMessages(messages: Record<string, Message[]>, sessionID: string, incoming: Message[]) {
  const existing = messages[sessionID] ?? []
  return { ...messages, [sessionID]: orderMessages([...existing, ...incoming]) }
}

export function appendMessageContent(messages: Record<string, Message[]>, sessionID: string, messageID: string, content: string) {
  return {
    ...messages,
    [sessionID]: (messages[sessionID] ?? []).map((message) =>
      message.id === messageID ? { ...message, content: `${message.content}${content}` } : message,
    ),
  }
}

export function setMessageContent(messages: Record<string, Message[]>, sessionID: string, messageID: string, content: string) {
  return {
    ...messages,
    [sessionID]: (messages[sessionID] ?? []).map((message) =>
      message.id === messageID && message.content !== content ? { ...message, content } : message,
    ),
  }
}
```

- [ ] **Step 4: Wire helpers into appStore**

In `web/src/stores/appStore.tsx`, import the helpers:

```ts
import { appendMessageContent, applyMessages, setMessageContent } from "./appReducers"
```

Then replace reducer branches for `SET_MESSAGES`, `APPEND_MESSAGE_CONTENT`, and `SET_MESSAGE_CONTENT` to call these helpers while preserving existing action names.

- [ ] **Step 5: Extract active session data hook without changing behavior**

Create `web/src/components/chat/useActiveSessionData.ts` and move only the three loading/polling effects from `ChatArea.tsx` into a hook:

```ts
export function useActiveSessionData(input: { activeSessionID: string | null; activeDirectory?: string }) {
  // Move the existing message load, todo load, and 3s refresh effects here.
  // Keep the same API functions and dispatch actions.
}
```

Implementation must be the exact moved code from `ChatArea`, with inputs replacing closed-over variables.

- [ ] **Step 6: Extract prompt controller hook without changing behavior**

Create `web/src/components/chat/usePromptController.ts` and move `handleSend` plus `handleAbort` from `ChatArea.tsx` into:

```ts
export function usePromptController(input: { activeSessionID: string | null; activeDirectory?: string }) {
  return { handleSend, handleAbort }
}
```

Keep model routing and local-run fallback logic unchanged in this task.

- [ ] **Step 7: Make ChatArea a composition component**

In `ChatArea.tsx`, replace the moved effects with:

```ts
useActiveSessionData({ activeSessionID, activeDirectory })
const { handleSend, handleAbort } = usePromptController({ activeSessionID, activeDirectory })
```

Keep layout JSX unchanged.

- [ ] **Step 8: Add reducer test to verify script**

In `package.json`, add `node --import tsx web/src/stores/appReducers.test.mjs` before existing web tests.

- [ ] **Step 9: Verify Task 6**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx web/src/stores/appReducers.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all commands pass.

---

### Task 7: MiMo Process Supervisor Boundary

**Covers:** M4

**Files:**
- Create: `server/src/mimoSupervisor.ts`
- Create: `server/src/mimoSupervisor.test.mjs`
- Modify: `server/src/index.ts`
- Modify: `server/src/mimo.ts`
- Modify: `package.json:16`

**Interfaces:**
- Produces: `createMimoSupervisor(options)` with `ensureBase()`, `restartBase()`, `status()`, and `stopAll()`.
- Consumes: existing `detectMimo`, `startMimoServer`, `stopMimoServer`, `checkHealth`, `listManagedMimoServers`, `stopManagedMimoServers`.

- [ ] **Step 1: Write supervisor fake test**

Create `server/src/mimoSupervisor.test.mjs`:

```js
import assert from "node:assert/strict"
import { createMimoSupervisor } from "./mimoSupervisor.ts"

let started = 0
let stopped = 0
const supervisor = createMimoSupervisor({
  host: "127.0.0.1",
  preferredPort: 4096,
  workspaceRoot: "/tmp/project",
  checkHealth: async () => ({ healthy: false }),
  findExistingPort: async () => null,
  findAvailablePort: async () => 4096,
  startServer: async () => {
    started += 1
    return { url: "http://127.0.0.1:4096", port: 4096, pid: 123 }
  },
  stopServer: async () => {
    stopped += 1
  },
  stopManagedServers: async () => undefined,
  listManagedServers: () => [],
})

await supervisor.ensureBase()
assert.equal(started, 1)
assert.equal(supervisor.status().managed, true)
assert.equal(supervisor.status().base.url, "http://127.0.0.1:4096")
await supervisor.restartBase()
assert.equal(stopped, 1)
assert.equal(started, 2)
await supervisor.stopAll()
assert.equal(stopped, 2)

console.log("mimo supervisor tests passed")
```

- [ ] **Step 2: Run supervisor test to verify it fails**

Run: `PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/mimoSupervisor.test.mjs`

Expected: FAIL because `mimoSupervisor.ts` does not exist.

- [ ] **Step 3: Implement minimal supervisor**

Create `server/src/mimoSupervisor.ts`:

```ts
import type { MimoServerInfo } from "./mimo.js"

interface SupervisorOptions {
  host: string
  preferredPort: number
  workspaceRoot: string
  checkHealth: (url: string) => Promise<{ healthy: boolean; version?: string }>
  findExistingPort: () => Promise<number | null>
  findAvailablePort: () => Promise<number>
  startServer: (host: string, port: number, workspaceRoot: string) => Promise<MimoServerInfo>
  stopServer: () => Promise<void>
  stopManagedServers: () => Promise<void>
  listManagedServers: () => unknown
}

export function createMimoSupervisor(options: SupervisorOptions) {
  let base: MimoServerInfo = { url: `http://${options.host}:${options.preferredPort}`, port: options.preferredPort, pid: 0 }
  let managed = false

  async function ensureBase() {
    const existingPort = await options.findExistingPort()
    if (existingPort !== null) {
      base = { url: `http://${options.host}:${existingPort}`, port: existingPort, pid: 0 }
      managed = false
      return base
    }
    const port = await options.findAvailablePort()
    base = await options.startServer(options.host, port, options.workspaceRoot)
    managed = true
    return base
  }

  async function restartBase() {
    if (!managed) return { ok: false, error: "MiMo serve is not managed by this WebUI process. Please restart the WebUI service manually." }
    await options.stopServer()
    const port = await options.findAvailablePort()
    base = await options.startServer(options.host, port, options.workspaceRoot)
    return { ok: true, url: base.url }
  }

  async function stopAll() {
    if (managed) await options.stopServer()
    await options.stopManagedServers()
  }

  return {
    ensureBase,
    restartBase,
    stopAll,
    status: () => ({ base, managed, projectServers: options.listManagedServers() }),
  }
}
```

- [ ] **Step 4: Integrate supervisor into index**

Replace base MiMo mutable state in `server/src/index.ts` with the supervisor. Keep `createApp()` options receiving `mimoInfo` from `supervisor.status().base`, and `isMimoManaged` from `supervisor.status().managed`.

- [ ] **Step 5: Add supervisor test to verify script**

In `package.json`, add `node --import tsx server/src/mimoSupervisor.test.mjs` after `server/src/mimo.test.mjs`.

- [ ] **Step 6: Verify Task 7**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" node --import tsx server/src/mimoSupervisor.test.mjs
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: all commands pass.

---

### Task 8: Documentation Source Of Truth Cleanup

**Covers:** M4

**Files:**
- Create: `docs/architecture.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/operations.md`
- Modify: `docs/testing.md`
- Create: `docs/archive/README.md`

**Interfaces:**
- Produces: stable current-fact docs for users and maintainers.
- Consumes: historical `docs/compose` plans only as archived execution history, not current truth.

- [ ] **Step 1: Create architecture document**

Create `docs/architecture.md`:

```markdown
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
```

- [ ] **Step 2: Add archive notice**

Create `docs/archive/README.md`:

```markdown
# Archive

Files under `docs/compose` are historical planning and execution records.
They are useful for understanding why changes were made, but they are not the source of truth for current behavior.

Use README, operations, testing, and architecture docs for current facts.
```

- [ ] **Step 3: Update AGENTS verification guidance**

In `AGENTS.md`, replace stale statements that say there is no repo-level verification script with:

```markdown
- Run `npm run verify` before claiming completion for cross-cutting changes; it runs focused regression tests, typecheck, and build.
- For smaller focused checks, use package typechecks or the specific `node --import tsx ...test.mjs` file listed in `package.json`.
```

- [ ] **Step 4: Link current docs from README**

Add a short section:

```markdown
## More Documentation

- `docs/operations.md` covers runtime configuration, auth, ports, and troubleshooting.
- `docs/testing.md` covers verification commands.
- `docs/architecture.md` explains the frontend/backend/MiMo process boundaries.
```

- [ ] **Step 5: Verify Task 8**

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
```

Expected: full verification passes.

---

## Execution Order

1. Task 1: Portable startup and config truth.
2. Task 2: Safe network defaults and minimal status.
3. Task 3: Workspace directory policy.
4. Task 4: Provider base URL hardening.
5. Task 5: Release package and third-party deployment.
6. Task 6: Frontend state and prompt orchestration guardrails.
7. Task 7: MiMo process supervisor boundary.
8. Task 8: Documentation source-of-truth cleanup.

Tasks 1-5 should be completed before advertising third-party deployability. Tasks 6-8 can run after the deployability baseline if release urgency is higher.

## Final Verification

Run:

```bash
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run verify
PATH="/home/yzy/.cache/pre-commit/repoupkf3_zx/node_env-default/bin:$PATH" npm run package:release
```

Then smoke-test the package from a clean temporary directory:

```bash
mkdir -p /tmp/mimo-webui-release-smoke
tar -xzf dist-release/mimo-code-webui-v0.1.0.tar.gz -C /tmp/mimo-webui-release-smoke
```

Expected: archive extracts successfully and contains `web/dist`, `server/dist`, `scripts/start.sh`, `scripts/start.bat`, `README.md`, and operations/testing docs.

## Self-Review Notes

- Spec coverage: M0 covered by Task 1; M1 by Task 2; M2 by Tasks 3-4; M3 by Task 5; M4 by Tasks 6-8.
- Placeholder scan: no TBD/TODO placeholders are required for implementers; code snippets define the intended interfaces.
- Type consistency: function names introduced here are stable across tasks: `validateWorkspaceDirectory`, `createMimoSupervisor`, `applyMessages`, `appendMessageContent`, `setMessageContent`, `useActiveSessionData`, and `usePromptController`.
