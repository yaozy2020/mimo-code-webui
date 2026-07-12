import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const installer = path.join(root, "deploy/mimo-code-webui")
const unit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui.service"))
const backupServiceUnit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui-backup.service"))
const backupTimerUnit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui-backup.timer"))
const alertUnit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui-alert@.service"))
const backupScript = fs.readFileSync(path.join(root, "scripts/backup-state.mjs"))
const backupServiceStateScript = fs.readFileSync(path.join(root, "scripts/backup-service-state.sh"))
const alertScript = fs.readFileSync(path.join(root, "scripts/send-alert.sh"))
const rollbackSafetyContract = fs.readFileSync(path.join(root, "deploy/rollback-safety-contract-v1"))
const unitNames = [
  "mimo-code-webui.service",
  "mimo-code-webui-backup.service",
  "mimo-code-webui-backup.timer",
  "mimo-code-webui-alert@.service",
]
const signingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-signing-"))
const signingKey = path.join(signingDirectory, "release.key")
const publicKey = path.join(signingDirectory, "release.pub")
assert.equal(spawnSync("openssl", ["genpkey", "-algorithm", "ED25519", "-out", signingKey]).status, 0)
assert.equal(spawnSync("openssl", ["pkey", "-in", signingKey, "-pubout", "-out", publicKey]).status, 0)

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function createRelease(directory, version) {
  const stageName = `mimo-code-webui-v${version}`
  const stage = path.join(directory, stageName)
  const files = new Map([
    ["server/dist/index.js", Buffer.from("console.log('fixture')\n")],
    ["web/dist/index.html", Buffer.from("<!doctype html>\n")],
    ["scripts/start.sh", Buffer.from("#!/usr/bin/env bash\nexit 0\n")],
    ["scripts/backup-state.mjs", backupScript],
    ["scripts/backup-service-state.sh", backupServiceStateScript],
    ["scripts/send-alert.sh", alertScript],
    ["deploy/mimo-code-webui", fs.readFileSync(installer)],
    ["deploy/rollback-safety-contract-v1", rollbackSafetyContract],
    ["deploy/systemd/mimo-code-webui.service", unit],
    ["deploy/systemd/mimo-code-webui-backup.service", backupServiceUnit],
    ["deploy/systemd/mimo-code-webui-backup.timer", backupTimerUnit],
    ["deploy/systemd/mimo-code-webui-alert@.service", alertUnit],
    ["package.json", Buffer.from(`{"name":"fixture","version":"${version}"}\n`)],
    ["package-lock.json", Buffer.from(`{"name":"fixture","version":"${version}","lockfileVersion":3,"packages":{}}\n`)],
  ])
  for (const [relative, content] of files) {
    const target = path.join(stage, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  const manifest = {
    schemaVersion: 1,
    product: "mimo-code-webui",
    version,
    gitCommit: "a".repeat(40),
    dirty: false,
    sourceDateEpoch: 1,
    lockfileSha256: sha256(files.get("package-lock.json")),
    files: [...files].map(([relative, content]) => ({ path: relative, size: content.length, sha256: sha256(content) })),
  }
  fs.writeFileSync(path.join(stage, "release-manifest.json"), `${JSON.stringify(manifest)}\n`)
  const archive = path.join(directory, `${stageName}.tar.gz`)
  const tar = spawnSync("tar", ["-czf", archive, "-C", directory, stageName], { encoding: "utf8" })
  assert.equal(tar.status, 0, tar.stderr)
  fs.writeFileSync(`${archive}.sha256`, `${sha256(fs.readFileSync(archive))}  ${path.basename(archive)}\n`)
  const sign = spawnSync("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", signingKey, "-in", archive, "-out", `${archive}.sig`], { encoding: "utf8" })
  assert.equal(sign.status, 0, sign.stderr)
  return archive
}

function run(sandbox, args, extraEnv = {}) {
  const signedActions = new Set(["install", "upgrade", "verify-archive"])
  const effectiveArgs = signedActions.has(args[0]) && !args.includes("--public-key") ? [...args, "--public-key", publicKey] : args
  return spawnSync(installer, effectiveArgs, {
    cwd: root,
    env: { ...process.env, MIMO_REUSE_EXISTING: "false", MIMO_DEPLOY_TEST_MODE: "1", MIMO_DEPLOY_TEST_ROOT: sandbox, ...extraEnv },
    encoding: "utf8",
  })
}

async function runAsync(sandbox, args, extraEnv = {}) {
  const effectiveArgs = ["install", "upgrade", "verify-archive"].includes(args[0]) && !args.includes("--public-key") ? [...args, "--public-key", publicKey] : args
  return await new Promise((resolve) => {
    const child = spawn(installer, effectiveArgs, {
      cwd: root,
      env: { ...process.env, MIMO_REUSE_EXISTING: "false", MIMO_DEPLOY_TEST_MODE: "1", MIMO_DEPLOY_TEST_ROOT: sandbox, ...extraEnv },
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
}

process.on("exit", () => fs.rmSync(signingDirectory, { recursive: true, force: true }))

function currentRelease(sandbox) {
  const link = path.join(sandbox, "opt/mimo-code-webui/current")
  return fs.existsSync(link) ? path.basename(fs.realpathSync(link)) : null
}

function releaseDirectories(sandbox) {
  const directory = path.join(sandbox, "opt/mimo-code-webui/releases")
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : []
}

function deploymentState(sandbox) {
  const readPath = (relative) => {
    const target = path.join(sandbox, relative)
    if (!fs.existsSync(target)) return null
    if (fs.lstatSync(target).isSymbolicLink()) return fs.readlinkSync(target)
    const stat = fs.statSync(target)
    return {
      content: fs.readFileSync(target),
      mode: stat.mode & 0o7777,
      uid: stat.uid,
      gid: stat.gid,
    }
  }
  return {
    current: readPath("opt/mimo-code-webui/current"),
    previous: readPath("opt/mimo-code-webui/previous"),
    env: readPath("etc/mimo-code-webui/webui.env"),
    units: unitNames.map((name) => readPath(`etc/systemd/system/${name}`)),
  }
}

function installedReleasePath(sandbox, name) {
  return path.join(sandbox, "opt/mimo-code-webui/releases", name)
}

function assertSnapshotClean(snapshotRoot, label) {
  assert.deepEqual(fs.existsSync(snapshotRoot) ? fs.readdirSync(snapshotRoot) : [], [], label)
}

function mode(target) {
  return fs.statSync(target).mode & 0o777
}

test("sandbox deployment lifecycle is transactional", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-fixture-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-root-"))
  try {
    const releaseA = createRelease(fixture, "1.0.0")
    const releaseB = createRelease(fixture, "1.1.0")

    const install = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"])
    assert.equal(install.status, 0, install.stderr)
    const installedA = currentRelease(sandbox)
    assert.match(installedA, /^1\.0\.0-/)
    const config = fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env"), "utf8")
    assert.match(config, /^HOST=127\.0\.0\.1$/m)
    assert.match(config, /^AUTH_TOKEN=[a-f0-9]{64}$/m)

    const duplicateInstall = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseB, "--mode", "reverse-proxy"])
    assert.notEqual(duplicateInstall.status, 0)
    assert.equal(currentRelease(sandbox), installedA)

    const ignoredUpgradeOption = run(sandbox, ["upgrade", "--archive", releaseB, "--port", "9999"])
    assert.notEqual(ignoredUpgradeOption.status, 0)
    assert.equal(currentRelease(sandbox), installedA)

    const upgrade = run(sandbox, ["upgrade", "--archive", releaseB])
    assert.equal(upgrade.status, 0, upgrade.stderr)
    const installedB = currentRelease(sandbox)
    assert.match(installedB, /^1\.1\.0-/)
    assert.equal(path.basename(fs.realpathSync(path.join(sandbox, "opt/mimo-code-webui/previous"))), installedA)
    assert.equal(fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env"), "utf8"), config)
    assert.equal(JSON.parse(fs.readFileSync(path.join(sandbox, "var/lib/mimo-code-webui/backup-status.json"), "utf8")).state, "healthy")

    const rollback = run(sandbox, ["rollback"])
    assert.equal(rollback.status, 0, rollback.stderr)
    assert.equal(currentRelease(sandbox), installedA)

    const status = run(sandbox, ["status"])
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /AUTH_TOKEN=configured/)
    assert.doesNotMatch(status.stdout, /AUTH_TOKEN=[a-f0-9]{64}/)

    const uninstall = run(sandbox, ["uninstall"])
    assert.equal(uninstall.status, 0, uninstall.stderr)
    assert.equal(fs.existsSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service")), false)
    assert.equal(fs.existsSync(path.join(sandbox, "etc/mimo-code-webui/webui.env")), true)

    const purge = run(sandbox, ["uninstall", "--purge", "--yes", "--non-interactive"])
    assert.equal(purge.status, 0, purge.stderr)
    assert.equal(fs.existsSync(path.join(sandbox, "opt/mimo-code-webui")), false)
    assert.equal(fs.existsSync(path.join(sandbox, "etc/mimo-code-webui")), false)
    assert.equal(fs.existsSync(path.join(sandbox, "srv/mimo-code-workspaces")), true)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("release signature authenticates the publisher before deployment", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-signature-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-signature-root-"))
  try {
    const release = createRelease(fixture, "1.0.0")
    const missingKey = run(sandbox, ["verify-archive", "--archive", release, "--public-key", path.join(fixture, "missing.pub")])
    assert.notEqual(missingKey.status, 0)
    assert.match(missingKey.stderr, /trusted public key not found/)

    fs.writeFileSync(`${release}.sig`, Buffer.alloc(64))
    const forged = run(sandbox, ["verify-archive", "--archive", release])
    assert.notEqual(forged.status, 0)
    assert.match(forged.stderr, /signature verification failed/)
    assert.equal(fs.existsSync(path.join(sandbox, "opt/mimo-code-webui")), false)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("deployment blocks incompatible MiMo before backup, stop, extraction, or switch", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-compat-"))
  try {
    const release = createRelease(fixture, "1.0.0")
    for (const scenario of [
      { name: "missing", version: "missing", probe: "ok", error: /MiMo-Code CLI is required/ },
      { name: "old", version: "0.1.4", probe: "ok", error: /MiMo-Code 0\.1\.5\+ is required/ },
      { name: "unparsable", version: "development", probe: "ok", error: /cannot parse MiMo-Code version/ },
      { name: "prerelease", version: "0.1.5-rc.1", probe: "ok", error: /cannot parse MiMo-Code version/ },
      { name: "mixed", version: "MiMo-Code version is 0.1.5 (stable)", probe: "ok", error: /cannot parse MiMo-Code version/ },
      { name: "probe failure", version: "0.1.5", probe: "fail", reuse: "true", error: /read-only compatibility probe failed/ },
    ]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `mimo-deploy-compat-${scenario.name}-`))
      try {
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const result = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
          MIMO_DEPLOY_TEST_MIMO_VERSION: scenario.version,
          MIMO_DEPLOY_TEST_MIMO_PROBE: scenario.probe,
          MIMO_REUSE_EXISTING: scenario.reuse ?? "false",
        })
        assert.notEqual(result.status, 0, scenario.name)
        assert.match(result.stderr, scenario.error)
        assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
        assert.equal(fs.existsSync(path.join(sandbox, "opt/mimo-code-webui/releases")), false)
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }

    for (const version of ["0.1.5", "0.2.0", "mimo 0.1.5", "MiMo-Code version v0.2.0"]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-compatible-"))
      try {
        const result = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
          MIMO_DEPLOY_TEST_MIMO_VERSION: version,
          MIMO_DEPLOY_TEST_MIMO_PROBE: "ok",
        })
        assert.equal(result.status, 0, result.stderr)
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("compatibility probe uses configured endpoint and validates bounded JSON protocol", async () => {
  const http = await import("node:http")
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-http-probe-"))
  const release = createRelease(fixture, "1.0.0")
  const requests = []
  let responseMode = "healthy"
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url })
    res.setHeader("content-type", "application/json")
    if (responseMode === "invalid") return res.end("not json")
    if (responseMode === "slow") return setTimeout(() => res.end(JSON.stringify({ healthy: true })), 2500)
    if (responseMode === "health-http" && req.url === "/global/health") { res.statusCode = 503; return res.end("{}") }
    if (responseMode === "path-http" && req.url === "/global/path") { res.statusCode = 503; return res.end("{}") }
    if (responseMode === "path-unavailable" && req.url === "/global/path") {
      res.statusCode = 503
      return res.end(JSON.stringify({ error: "Web UI is temporarily unavailable." }))
    }
    if (responseMode === "path-unavailable-invalid" && req.url === "/global/path") { res.statusCode = 503; return res.end("not json") }
    if (responseMode === "path-unavailable-wrong-error" && req.url === "/global/path") {
      res.statusCode = 503
      return res.end(JSON.stringify({ error: "Service unavailable." }))
    }
    if (req.url === "/global/health") return res.end(JSON.stringify(responseMode === "bad-health" ? {} : { healthy: true, version: responseMode === "old-health" ? "0.1.4" : responseMode === "mismatched-health" ? "0.2.0" : "0.1.5" }))
    if (req.url === "/global/path") return res.end(JSON.stringify(responseMode === "bad-path" ? {} : { directory: "/srv/custom" }))
    if (req.url === "/config") return res.end(JSON.stringify(responseMode === "bad-config" ? [] : { model: "fixture" }))
    res.statusCode = 404
    res.end("{}")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  try {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-http-probe-root-"))
    const external = await runAsync(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
      MIMO_REUSE_EXISTING: "true",
      MIMO_HOST: "127.0.0.1",
      MIMO_PORT: String(port),
      MIMO_DEPLOY_TEST_REAL_PROBE: "1",
    })
    assert.equal(external.status, 0, external.stderr)
    assert.deepEqual(requests, [
      { method: "GET", url: "/global/health" },
      { method: "GET", url: "/global/path" },
      { method: "GET", url: "/config" },
      { method: "GET", url: "/global/health" },
      { method: "GET", url: "/global/path" },
      { method: "GET", url: "/config" },
    ])
    const config = fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env"), "utf8")
    assert.match(config, new RegExp(`^MIMO_PORT=${port}$`, "m"))
    assert.match(config, /^MIMO_REUSE_EXISTING=true$/m)
    fs.rmSync(sandbox, { recursive: true, force: true })

    responseMode = "path-unavailable"
    requests.length = 0
    const unavailableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-http-path-unavailable-"))
    const unavailable = await runAsync(unavailableRoot, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
      MIMO_REUSE_EXISTING: "true",
      MIMO_HOST: "127.0.0.1",
      MIMO_PORT: String(port),
      MIMO_DEPLOY_TEST_REAL_PROBE: "1",
    })
    assert.equal(unavailable.status, 0, unavailable.stderr)
    assert.deepEqual(requests, [
      { method: "GET", url: "/global/health" },
      { method: "GET", url: "/global/path" },
      { method: "GET", url: "/config" },
      { method: "GET", url: "/global/health" },
      { method: "GET", url: "/global/path" },
      { method: "GET", url: "/config" },
    ])
    fs.rmSync(unavailableRoot, { recursive: true, force: true })

    for (const mode of ["invalid", "bad-health", "bad-path", "bad-config", "old-health", "mismatched-health", "health-http", "path-http", "path-unavailable-invalid", "path-unavailable-wrong-error", "slow"]) {
      responseMode = mode
      requests.length = 0
      const failedRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mimo-deploy-http-${mode}-`))
      const startedAt = Date.now()
      const result = await runAsync(failedRoot, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
        MIMO_REUSE_EXISTING: "true",
        MIMO_HOST: "127.0.0.1",
        MIMO_PORT: String(port),
        MIMO_DEPLOY_TEST_REAL_PROBE: "1",
        MIMO_PROBE_TIMEOUT: "1",
      })
      assert.notEqual(result.status, 0, mode)
      assert.match(result.stderr, /compatibility probe failed/)
      if (mode === "slow") assert.ok(Date.now() - startedAt < 2200, "probe must honor the one-second maximum timeout")
      assert.equal(fs.existsSync(path.join(failedRoot, "opt/mimo-code-webui")), false)
      fs.rmSync(failedRoot, { recursive: true, force: true })
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("probe timeout is validated before mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-timeout-"))
  try {
    const release = createRelease(fixture, "1.0.0")
    for (const timeout of ["0", "31", "1.5", "x", " "]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-timeout-root-"))
      fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
      const result = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], { MIMO_PROBE_TIMEOUT: timeout })
      assert.notEqual(result.status, 0, timeout)
      assert.match(result.stderr, /MIMO_PROBE_TIMEOUT must be an integer from 1 to 30/)
      assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
      assert.equal(fs.existsSync(path.join(sandbox, "opt/mimo-code-webui")), false)
      fs.rmSync(sandbox, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("managed first install does not require a pre-existing MiMo endpoint", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-managed-first-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-managed-first-root-"))
  try {
    const release = createRelease(fixture, "1.0.0")
    const result = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
      MIMO_REUSE_EXISTING: "false",
      MIMO_DEPLOY_TEST_MIMO_PROBE: "ok",
    })
    assert.equal(result.status, 0, result.stderr)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("managed first install compensates a candidate protocol failure", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-managed-protocol-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-managed-protocol-root-"))
  try {
    const release = createRelease(fixture, "1.0.0")
    const result = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"], {
      MIMO_REUSE_EXISTING: "false",
      MIMO_DEPLOY_TEST_MIMO_PROBE: "fail",
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /compatibility probe failed/)
    assert.equal(fs.existsSync(path.join(sandbox, "opt/mimo-code-webui/current")), false)
    assert.equal(fs.existsSync(path.join(sandbox, "etc/mimo-code-webui")), false)
    assert.equal(fs.existsSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service")), false)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("rollback catches a real candidate protocol failure and compensates", async () => {
  const http = await import("node:http")
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-real-probe-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-real-probe-root-"))
  let healthRequests = 0
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json")
    if (req.url === "/global/health") {
      healthRequests += 1
      return res.end(JSON.stringify(healthRequests === 1 ? { healthy: true, version: "0.1.5" } : {}))
    }
    if (req.url === "/global/path") return res.end(JSON.stringify({ directory: "/srv/custom" }))
    if (req.url === "/config") return res.end(JSON.stringify({ model: "fixture" }))
    res.statusCode = 404
    res.end("{}")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  try {
    const releaseA = createRelease(fixture, "1.0.0")
    const releaseB = createRelease(fixture, "1.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
    const configFile = path.join(sandbox, "etc/mimo-code-webui/webui.env")
    const config = fs.readFileSync(configFile, "utf8")
      .replace(/^MIMO_HOST=.*$/m, "MIMO_HOST=127.0.0.1")
      .replace(/^MIMO_PORT=.*$/m, `MIMO_PORT=${port}`)
    fs.writeFileSync(configFile, config)
    const before = deploymentState(sandbox)
    const result = await runAsync(sandbox, ["rollback"], {
      MIMO_DEPLOY_TEST_REAL_PROBE: "1",
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /rollback failed; original deployment state restored/)
    assert.deepEqual(deploymentState(sandbox), before)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("failed install and upgrade restore prior state", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-fixture-"))
  try {
    const releaseA = createRelease(fixture, "2.0.0")
    const releaseB = createRelease(fixture, "2.1.0")
    const failedSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-failed-"))
    const failedInstall = run(failedSandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"], { MIMO_DEPLOY_TEST_HEALTH: "unhealthy" })
    assert.notEqual(failedInstall.status, 0)
    assert.equal(fs.existsSync(path.join(failedSandbox, "opt/mimo-code-webui/current")), false)
    assert.equal(fs.existsSync(path.join(failedSandbox, "etc/systemd/system/mimo-code-webui.service")), false)
    assert.equal(fs.existsSync(path.join(failedSandbox, "etc/mimo-code-webui")), false)
    fs.rmSync(failedSandbox, { recursive: true, force: true })

    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-upgrade-"))
    const install = run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"])
    assert.equal(install.status, 0, install.stderr)
    const installedA = currentRelease(sandbox)
    const previousBefore = path.join(sandbox, "opt/mimo-code-webui/previous")
    const unitBefore = fs.readFileSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service"))
    const configBefore = fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env"))
    fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
    const healthFile = path.join(sandbox, "health-sequence")
    fs.writeFileSync(healthFile, "healthy\nunhealthy\nhealthy\n")
    const failedUpgrade = run(sandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_HEALTH_FILE: healthFile })
    assert.notEqual(failedUpgrade.status, 0)
    assert.equal(currentRelease(sandbox), installedA)
    assert.equal(fs.existsSync(previousBefore), false)
    assert.deepEqual(fs.readFileSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service")), unitBefore)
    assert.deepEqual(fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env")), configBefore)
    const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n")
    assert.deepEqual(calls, ["is-active mimo-code-webui", "is-enabled mimo-code-webui", "stop mimo-code-webui", "start mimo-code-webui", "daemon-reload", "enable mimo-code-webui", "restart mimo-code-webui", "daemon-reload", "restart mimo-code-webui", "daemon-reload", "enable mimo-code-webui", "restart mimo-code-webui"])
    fs.rmSync(sandbox, { recursive: true, force: true })
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("every upgrade mutation failure restores the complete prior transaction state", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-transaction-"))
  try {
    const releaseA = createRelease(fixture, "8.0.0")
    const releaseB = createRelease(fixture, "8.1.0")
    const releaseC = createRelease(fixture, "8.2.0")
    const failurePoints = [
      "copy-main-unit",
      "copy-backup-service-unit",
      "copy-backup-timer-unit",
      "copy-alert-unit",
      "daemon-reload",
      "enable",
      "switch-current-link",
      "switch-previous-link",
      "switch-commit-link",
    ]

    for (const active of [true, false]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-transaction-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
        const envFile = path.join(sandbox, "etc/mimo-code-webui/webui.env")
        fs.appendFileSync(envFile, "TRANSACTION_SENTINEL=preserve-me\n")
        fs.chmodSync(envFile, 0o640)
        fs.chmodSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service"), 0o600)
        fs.chmodSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui-backup.timer"), 0o664)
        if (!active) {
          fs.rmSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui-backup.service"))
          fs.rmSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui-alert@.service"))
        }
        const before = deploymentState(sandbox)
        fs.rmSync(path.join(sandbox, "var/lib/mimo-code-webui/deployment-recovery-required"), { force: true })

        for (const failurePoint of failurePoints) {
          fs.rmSync(path.join(sandbox, "var/lib/mimo-code-webui/deployment-recovery-required"), { force: true })
          fs.rmSync(path.join(sandbox, "var/lib/mimo-code-webui/deployment-transactions"), { recursive: true, force: true })
          fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
          const result = run(sandbox, ["upgrade", "--archive", releaseC, "--break-glass-skip-backup"], {
            MIMO_DEPLOY_TEST_ACTIVE: active ? "active" : "inactive",
            MIMO_DEPLOY_TEST_FAIL_AT: failurePoint,
          })
          assert.notEqual(result.status, 0, `${active ? "active" : "inactive"}: ${failurePoint}`)
          assert.deepEqual(deploymentState(sandbox), before, failurePoint)
          assert.match(result.stderr, /injected deployment failure/)
          const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n").filter(Boolean)
          if (active) {
            assert.ok(calls.includes("restart mimo-code-webui"), `${failurePoint}: active service was not restored`)
          } else {
            if (!["copy-main-unit", "copy-backup-service-unit", "copy-backup-timer-unit", "copy-alert-unit", "daemon-reload", "enable", "switch-current-link", "switch-previous-link", "switch-commit-link"].includes(failurePoint)) {
              assert.match(calls.join("\n"), /start mimo-code-webui[\s\S]*stop mimo-code-webui/)
            }
          }
        }
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("rollback accepts different safe scripts with the same safety contract", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-compatible-contract-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-compatible-contract-root-"))
  try {
    const releaseA = createRelease(fixture, "11.0.0")
    const releaseB = createRelease(fixture, "11.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    const target = currentRelease(sandbox)
    assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
    fs.appendFileSync(path.join(installedReleasePath(sandbox, target), "scripts/backup-service-state.sh"), "\n# safe implementation revision\n")
    fs.appendFileSync(path.join(installedReleasePath(sandbox, target), "deploy/mimo-code-webui"), "\n# old deployer is not executed\n")
    const result = run(sandbox, ["rollback"])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(currentRelease(sandbox), target)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("rollback rejects missing or changed safety contract before mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-contract-"))
  try {
    const releaseA = createRelease(fixture, "12.0.0")
    const releaseB = createRelease(fixture, "12.1.0")
    for (const scenario of [
      { name: "missing contract", remove: true },
      { name: "changed contract" },
    ]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-contract-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        const target = currentRelease(sandbox)
        assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
        const targetFile = path.join(installedReleasePath(sandbox, target), "deploy/rollback-safety-contract-v1")
        if (scenario.remove) fs.rmSync(targetFile)
        else fs.appendFileSync(targetFile, "\nunsafe-change\n")
        const before = deploymentState(sandbox)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")

        const result = run(sandbox, ["rollback"])

        assert.notEqual(result.status, 0, scenario.name)
        assert.match(result.stderr, /rollback target safety contract/)
        assert.deepEqual(deploymentState(sandbox), before)
        assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("rollback preflight gates ownership recovery compatibility and strict states before mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-preflight-"))
  const releaseA = createRelease(fixture, "13.0.0")
  const releaseB = createRelease(fixture, "13.1.0")
  for (const scenario of [
    { name: "ownership", config: "MIMO_REUSE_EXISTING=true\n", error: /WebUI-owned MiMo processes/ },
    { name: "recovery", marker: "run/mimo-code-webui/backup-restart-required", error: /recovery is pending/ },
    { name: "minimum version", env: { MIMO_DEPLOY_TEST_MIMO_VERSION: "0.1.4" }, error: /0\.1\.5\+ is required/ },
    { name: "protocol", env: { MIMO_DEPLOY_TEST_MIMO_PROBE: "fail" }, error: /compatibility probe failed/ },
    { name: "service state", env: { MIMO_DEPLOY_TEST_ACTIVE: "failed" }, error: /ambiguous service state/ },
    { name: "enablement", env: { MIMO_DEPLOY_TEST_ENABLED: "masked" }, error: /ambiguous service enablement/ },
  ]) {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-preflight-root-"))
    try {
      assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
      assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
      if (scenario.config) fs.appendFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env"), scenario.config)
      if (scenario.marker) {
        const marker = path.join(sandbox, scenario.marker)
        fs.mkdirSync(path.dirname(marker), { recursive: true })
        fs.writeFileSync(marker, "pending\n")
      }
      const before = deploymentState(sandbox)
      fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
      const result = run(sandbox, ["rollback"], scenario.env)
      assert.notEqual(result.status, 0, scenario.name)
      assert.match(result.stderr, scenario.error)
      assert.deepEqual(deploymentState(sandbox), before)
      const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n").filter(Boolean)
      if (scenario.name === "service state") assert.deepEqual(calls, ["is-active mimo-code-webui"])
      else if (scenario.name === "enablement") assert.deepEqual(calls, ["is-active mimo-code-webui", "is-enabled mimo-code-webui"])
      else assert.deepEqual(calls, [])
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true })
    }
  }
  fs.rmSync(fixture, { recursive: true, force: true })
})

test("every rollback mutation failure restores exact state and service policy", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-transaction-"))
  const releaseA = createRelease(fixture, "14.0.0")
  const releaseB = createRelease(fixture, "14.1.0")
  const failurePoints = [
    "rollback-current-link", "rollback-copy-main-unit", "rollback-copy-backup-service-unit",
    "rollback-copy-backup-timer-unit", "rollback-copy-alert-unit", "rollback-daemon-reload",
    "rollback-enablement", "rollback-restart", "rollback-start", "rollback-health", "rollback-probe", "rollback-stop", "rollback-previous-link",
  ]
  for (const active of ["active", "inactive"]) for (const enabled of ["enabled", "disabled"]) {
    for (const failurePoint of failurePoints.filter((point) => {
      if (active === "active") return !["rollback-start", "rollback-stop"].includes(point)
      return point !== "rollback-restart"
    })) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-rollback-transaction-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
        const envFile = path.join(sandbox, "etc/mimo-code-webui/webui.env")
        fs.appendFileSync(envFile, "ROLLBACK_SENTINEL=preserve-me\n")
        fs.chmodSync(envFile, 0o640)
        fs.chmodSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service"), 0o600)
        fs.chmodSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui-alert@.service"), 0o664)
        const before = deploymentState(sandbox)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const result = run(sandbox, ["rollback"], {
          MIMO_DEPLOY_TEST_ACTIVE: active,
          MIMO_DEPLOY_TEST_ENABLED: enabled,
          MIMO_DEPLOY_TEST_FAIL_AT: failurePoint,
        })
        assert.notEqual(result.status, 0, `${active}/${enabled}/${failurePoint}`)
        assert.deepEqual(deploymentState(sandbox), before, failurePoint)
        const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8")
        assert.match(calls, enabled === "enabled" ? /enable mimo-code-webui/ : /disable mimo-code-webui/)
        if (active === "active") assert.match(calls, /restart mimo-code-webui/)
        else assert.match(calls, /stop mimo-code-webui/)
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  }
  fs.rmSync(fixture, { recursive: true, force: true })
})

test("upgrade snapshot is atomic before the transaction becomes active", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-snapshot-"))
  try {
    const releaseA = createRelease(fixture, "8.5.0")
    const releaseB = createRelease(fixture, "8.6.0")
    for (const failurePoint of [
      "snapshot-mktemp",
      "snapshot-env",
      "snapshot-main",
      "snapshot-backup-service",
      "snapshot-backup-timer",
      "snapshot-alert",
      "snapshot-manifest-finalize",
      "snapshot-metadata-finalize",
    ]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-snapshot-root-"))
      const snapshotRoot = path.join(sandbox, "transaction-snapshots")
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        const before = deploymentState(sandbox)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const result = run(sandbox, ["upgrade", "--archive", releaseB], {
          MIMO_DEPLOY_TEST_FAIL_AT: failurePoint,
          MIMO_DEPLOY_TEST_SNAPSHOT_ROOT: snapshotRoot,
        })
        assert.notEqual(result.status, 0, failurePoint)
        assert.match(result.stderr, new RegExp(`injected deployment failure: ${failurePoint}`))
        assert.deepEqual(deploymentState(sandbox), before, failurePoint)
        assert.deepEqual(releaseDirectories(sandbox), [currentRelease(sandbox)], failurePoint)
        const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n").filter(Boolean)
        assert.deepEqual(calls, ["is-active mimo-code-webui", "is-enabled mimo-code-webui"], failurePoint)
        assertSnapshotClean(snapshotRoot, `${failurePoint}: snapshot leaked AUTH_TOKEN or other state`)
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("snapshot and environment secrets are private before their first write", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-private-"))
  try {
    const releaseA = createRelease(fixture, "8.7.0")
    const releaseB = createRelease(fixture, "8.8.0")
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-private-install-"))
    const configResult = run(installRoot, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"], {
      MIMO_DEPLOY_TEST_FAIL_AT: "config-file-created",
      MIMO_DEPLOY_TEST_UMASK: "000",
      MIMO_DEPLOY_TEST_KEEP_FAILED_ARTIFACTS: "true",
    })
    assert.notEqual(configResult.status, 0)
    const config = path.join(installRoot, "etc/mimo-code-webui/webui.env")
    assert.equal(mode(config), 0o600)
    assert.equal(fs.readFileSync(config, "utf8"), "")

    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-private-upgrade-"))
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    const snapshotRoot = path.join(sandbox, "transaction-snapshots")
    const snapshotResult = run(sandbox, ["upgrade", "--archive", releaseB], {
      MIMO_DEPLOY_TEST_FAIL_AT: "snapshot-directory-created",
      MIMO_DEPLOY_TEST_SNAPSHOT_ROOT: snapshotRoot,
      MIMO_DEPLOY_TEST_KEEP_SNAPSHOT: "true",
      MIMO_DEPLOY_TEST_UMASK: "000",
    })
    assert.notEqual(snapshotResult.status, 0)
    const snapshots = fs.readdirSync(snapshotRoot).map((name) => path.join(snapshotRoot, name))
    assert.equal(snapshots.length, 1)
    assert.equal(mode(snapshots[0]), 0o700)
    assert.deepEqual(fs.readdirSync(snapshots[0]), [])
    fs.rmSync(installRoot, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("upgrade preserves main service enablement and rejects ambiguous state", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-service-state-"))
  try {
    const releaseA = createRelease(fixture, "10.0.0")
    const releaseB = createRelease(fixture, "10.1.0")
    for (const enabled of ["enabled", "disabled"]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-enablement-"))
      assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
      fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
      assert.equal(run(sandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_ENABLED: enabled }).status, 0)
      const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8")
      assert.match(calls, /is-enabled mimo-code-webui/)
      if (enabled === "disabled") assert.match(calls, /disable mimo-code-webui/)
      fs.rmSync(sandbox, { recursive: true, force: true })
    }
    for (const state of ["failed", "activating", "deactivating", "unknown"]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-ambiguous-"))
      assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
      fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
      const result = run(sandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_ACTIVE: state })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /ambiguous service state/)
      assert.deepEqual(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n"), ["is-active mimo-code-webui"])
      fs.rmSync(sandbox, { recursive: true, force: true })
    }
    const failedDisabled = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-disabled-compensation-"))
    assert.equal(run(failedDisabled, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    fs.writeFileSync(path.join(failedDisabled, "systemctl.log"), "")
    const failed = run(failedDisabled, ["upgrade", "--archive", releaseB, "--break-glass-skip-backup"], {
      MIMO_DEPLOY_TEST_ENABLED: "disabled",
      MIMO_DEPLOY_TEST_FAIL_AT: "switch-commit-link",
    })
    assert.notEqual(failed.status, 0)
    assert.match(fs.readFileSync(path.join(failedDisabled, "systemctl.log"), "utf8"), /disable mimo-code-webui/)
    fs.rmSync(failedDisabled, { recursive: true, force: true })
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("post-commit prune failure keeps the new release selected", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-prune-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-prune-root-"))
  try {
    const releaseA = createRelease(fixture, "11.0.0")
    const releaseB = createRelease(fixture, "11.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    const result = run(sandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_FAIL_AT: "prune-releases" })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /maintenance failure/)
    assert.match(currentRelease(sandbox), /^11\.1\.0-/)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("keep-releases counts current and previous in the total", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-retention-"))
  try {
    for (const keep of [2, 3, 4]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-retention-root-"))
      try {
        const archives = [1, 2, 3, 4, 5].map((minor) => createRelease(fixture, `${keep}.${minor}.0`))
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", archives[0], "--mode", "reverse-proxy", "--keep-releases", String(keep)]).status, 0)
        for (const archive of archives.slice(1)) {
          const result = run(sandbox, ["upgrade", "--archive", archive, "--keep-releases", String(keep)])
          assert.equal(result.status, 0, result.stderr)
        }
        assert.equal(releaseDirectories(sandbox).length, keep)
        assert.ok(releaseDirectories(sandbox).includes(currentRelease(sandbox)))
        assert.ok(releaseDirectories(sandbox).includes(path.basename(fs.realpathSync(path.join(sandbox, "opt/mimo-code-webui/previous")))))
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("upgrade rejects invalid keep-releases before mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-invalid-retention-"))
  try {
    const releaseA = createRelease(fixture, "12.0.0")
    const releaseB = createRelease(fixture, "12.1.0")
    for (const keep of ["0", "1", "nope"]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-invalid-retention-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        const before = deploymentState(sandbox)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const result = run(sandbox, ["upgrade", "--archive", releaseB, "--keep-releases", keep])
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /keep-releases must be an integer at least 2/)
        assert.deepEqual(deploymentState(sandbox), before)
        assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
        assert.deepEqual(releaseDirectories(sandbox), [currentRelease(sandbox)])
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("failed recovery marker writes leave a blocking transaction snapshot", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-marker-failure-"))
  try {
    const releaseA = createRelease(fixture, "13.0.0")
    const releaseB = createRelease(fixture, "13.1.0")
    for (const markerFailure of ["readonly", "disk-full"]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-marker-failure-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        const failed = run(sandbox, ["upgrade", "--archive", releaseB, "--break-glass-skip-backup"], {
          MIMO_DEPLOY_TEST_FAIL_AT: "switch-commit-link",
          MIMO_DEPLOY_TEST_RESTART_FAIL: "true",
          MIMO_DEPLOY_TEST_MARKER_FAILURE: markerFailure,
        })
        assert.notEqual(failed.status, 0)
        assert.match(failed.stderr, /recovery marker.*failed/)
        const transactionRoot = path.join(sandbox, "var/lib/mimo-code-webui/deployment-transactions")
        assert.equal(fs.readdirSync(transactionRoot).length, 1)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const blocked = run(sandbox, ["upgrade", "--archive", releaseB])
        assert.notEqual(blocked.status, 0)
        assert.match(blocked.stderr, /incomplete deployment transaction is pending/)
        assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("inactive upgrade restores exactly once and leaves no false recovery marker", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-inactive-restore-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-inactive-restore-root-"))
  try {
    const releaseA = createRelease(fixture, "14.0.0")
    const releaseB = createRelease(fixture, "14.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
    const failed = run(sandbox, ["upgrade", "--archive", releaseB, "--break-glass-skip-backup"], {
      MIMO_DEPLOY_TEST_ACTIVE: "inactive",
      MIMO_DEPLOY_TEST_ENABLED: "disabled",
      MIMO_DEPLOY_TEST_HEALTH: "unhealthy",
    })
    assert.notEqual(failed.status, 0)
    const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n")
    assert.equal(calls.filter((call) => call === "daemon-reload").length, 2)
    assert.equal(calls.filter((call) => call === "disable mimo-code-webui").length, 2)
    assert.equal(calls.filter((call) => call === "stop mimo-code-webui").length, 1)
    assert.equal(fs.existsSync(path.join(sandbox, "var/lib/mimo-code-webui/deployment-recovery-required")), false)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("disabled baseline restore failure enters compensation for upgrade and rollback", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-disabled-restore-"))
  try {
    const releaseA = createRelease(fixture, "15.0.0")
    const releaseB = createRelease(fixture, "15.1.0")
    for (const action of ["upgrade", "rollback"]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-disabled-restore-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        assert.equal(run(sandbox, ["upgrade", "--archive", releaseB]).status, 0)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const args = action === "upgrade" ? ["upgrade", "--archive", createRelease(fixture, "15.2.0"), "--break-glass-skip-backup"] : ["rollback"]
        const failed = run(sandbox, args, {
          MIMO_DEPLOY_TEST_ENABLED: "disabled",
          MIMO_DEPLOY_TEST_DISABLE_FAIL: "true",
          ...(action === "upgrade" ? {} : { MIMO_DEPLOY_TEST_FAIL_AT: "rollback-current-link" }),
        })
        assert.notEqual(failed.status, 0)
        assert.match(failed.stderr, /compensation failed|manual recovery required/)
        const marker = path.join(sandbox, "var/lib/mimo-code-webui/deployment-recovery-required")
        assert.equal(mode(marker), 0o600)
        const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n")
        assert.ok(calls.includes("disable mimo-code-webui"))
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("upgrade reports compensation failure without replacing the original failure", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-compensation-"))
  try {
    const releaseA = createRelease(fixture, "9.0.0")
    const releaseB = createRelease(fixture, "9.1.0")
    for (const scenario of [
      { name: "restart fails", env: { MIMO_DEPLOY_TEST_RESTART_FAIL: "true" } },
      { name: "health fails", env: { MIMO_DEPLOY_TEST_HEALTH: "unhealthy" } },
      { name: "cleanup daemon reload fails", failurePoint: "copy-main-unit", env: { MIMO_DEPLOY_TEST_DAEMON_RELOAD_FAIL: "true" } },
    ]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-compensation-root-"))
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        const before = deploymentState(sandbox)
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const result = run(sandbox, ["upgrade", "--archive", releaseB, "--break-glass-skip-backup"], {
          MIMO_DEPLOY_TEST_FAIL_AT: scenario.failurePoint ?? "switch-commit-link",
          ...scenario.env,
        })
        assert.notEqual(result.status, 0, scenario.name)
        assert.match(result.stderr, new RegExp(`injected deployment failure: ${scenario.failurePoint ?? "switch-commit-link"}`))
        assert.match(result.stderr, /upgrade compensation failed; manual recovery required/)
        assert.deepEqual(deploymentState(sandbox), before)
        const marker = path.join(sandbox, "var/lib/mimo-code-webui/deployment-recovery-required")
        assert.equal(mode(marker), 0o600)
        const recovery = fs.readFileSync(marker, "utf8")
        assert.match(recovery, /^snapshot=.+\nold_current=.+\nold_previous=.*\nservice_active=(?:true|false)\nservice_enabled=(?:true|false)\nfailed_stage=compensation\n$/)
        assert.doesNotMatch(recovery, /AUTH_TOKEN|TRANSACTION_SENTINEL/)
        const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n")
        assert.ok(calls.includes("daemon-reload"), scenario.name)
        assert.ok(calls.includes("restart mimo-code-webui"), scenario.name)
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("pre-upgrade backup restores the prior service state before candidate mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-preflight-"))
  try {
    const releaseA = createRelease(fixture, "6.0.0")
    const releaseB = createRelease(fixture, "6.1.0")
    for (const scenario of [
      { name: "backup command fails", active: "active", failurePoint: "preflight-backup", starts: "success", health: "healthy", restored: /restored prior service state/, backupCreated: false },
      { name: "active stop fails then compensation succeeds", active: "active", stopFails: "true", starts: "success", health: "healthy", restored: /restored active service/, backupCreated: false },
      { name: "active restart fails then compensation succeeds", active: "active", starts: "fail,success", health: "healthy", restored: /restored active service/ },
      { name: "active health fails then compensation succeeds", active: "active", starts: "success,success", health: "unhealthy,healthy", restored: /restored active service/ },
      { name: "active compensation fails", active: "active", starts: "fail,fail", health: "healthy", restored: /failed to restore active service/ },
    ]) {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-preflight-root-"))
      const snapshotRoot = path.join(sandbox, "transaction-snapshots")
      try {
        assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
        const installed = currentRelease(sandbox)
        const releases = releaseDirectories(sandbox)
        const config = fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env"))
        const units = [
          "mimo-code-webui.service",
          "mimo-code-webui-backup.service",
          "mimo-code-webui-backup.timer",
          "mimo-code-webui-alert@.service",
        ].map((name) => fs.readFileSync(path.join(sandbox, "etc/systemd/system", name)))
        fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
        const result = run(sandbox, ["upgrade", "--archive", releaseB], {
          MIMO_DEPLOY_TEST_ACTIVE: scenario.active,
          MIMO_DEPLOY_TEST_STOP_FAIL: scenario.stopFails ?? "false",
          MIMO_DEPLOY_TEST_START_SEQUENCE: scenario.starts,
          MIMO_DEPLOY_TEST_HEALTH_SEQUENCE: scenario.health,
          MIMO_DEPLOY_TEST_SNAPSHOT_ROOT: snapshotRoot,
          MIMO_DEPLOY_TEST_FAIL_AT: scenario.failurePoint ?? "",
        })
        assert.notEqual(result.status, 0, scenario.name)
        if (scenario.failurePoint === "preflight-backup") assert.match(result.stderr, /pre-upgrade backup failed/)
        else assert.match(result.stderr, /old release failed to recover after pre-upgrade backup/)
        assert.match(result.stderr, scenario.restored)
        assert.equal(currentRelease(sandbox), installed)
        assert.deepEqual(releaseDirectories(sandbox), releases)
        assert.deepEqual(fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env")), config)
        assert.deepEqual([
          "mimo-code-webui.service",
          "mimo-code-webui-backup.service",
          "mimo-code-webui-backup.timer",
          "mimo-code-webui-alert@.service",
        ].map((name) => fs.readFileSync(path.join(sandbox, "etc/systemd/system", name))), units)
        const backupStatus = path.join(sandbox, "var/lib/mimo-code-webui/backup-status.json")
        if (scenario.backupCreated === false) assert.equal(fs.existsSync(backupStatus), false)
        else assert.equal(JSON.parse(fs.readFileSync(backupStatus, "utf8")).state, "healthy")
        assertSnapshotClean(snapshotRoot, `${scenario.name}: transaction snapshot was not cleaned`)
        const recoveryMarker = path.join(sandbox, "var/lib/mimo-code-webui/upgrade-recovery-required")
        assert.equal(fs.existsSync(recoveryMarker), scenario.name === "active compensation fails")
        if (scenario.name === "active compensation fails") assert.equal(mode(recoveryMarker), 0o600)
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true })
      }
    }

    const inactiveSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-preflight-inactive-"))
    try {
      assert.equal(run(inactiveSandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
      fs.writeFileSync(path.join(inactiveSandbox, "systemctl.log"), "")
      const upgrade = run(inactiveSandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_ACTIVE: "inactive" })
      assert.equal(upgrade.status, 0, upgrade.stderr)
      const calls = fs.readFileSync(path.join(inactiveSandbox, "systemctl.log"), "utf8").trim().split("\n")
      assert.deepEqual(calls.filter((call) => /^(stop|start|restart) /.test(call)), ["start mimo-code-webui", "stop mimo-code-webui"])
      assert.match(currentRelease(inactiveSandbox), /^6\.1\.0-/)
    } finally {
      fs.rmSync(inactiveSandbox, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("upgrade rejects pending backup recovery before service or candidate mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-marker-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-marker-root-"))
  try {
    const releaseA = createRelease(fixture, "7.0.0")
    const releaseB = createRelease(fixture, "7.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    const installed = currentRelease(sandbox)
    const releases = releaseDirectories(sandbox)
    const marker = path.join(sandbox, "run/mimo-code-webui/backup-restart-required")
    fs.mkdirSync(path.dirname(marker), { recursive: true })
    fs.writeFileSync(marker, "stale-operation\n")
    fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
    const upgrade = run(sandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_ACTIVE: "inactive" })
    assert.notEqual(upgrade.status, 0)
    assert.match(upgrade.stderr, /backup service recovery is pending/)
    assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
    assert.equal(currentRelease(sandbox), installed)
    assert.deepEqual(releaseDirectories(sandbox), releases)
    assert.equal(fs.readFileSync(marker, "utf8"), "stale-operation\n")
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("scheduled backup restores only a service it stopped", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-backup-state-"))
  const marker = path.join(sandbox, "run/mimo-code-webui/backup-restart-required")
  const log = path.join(sandbox, "systemctl.log")
  const systemctl = path.join(sandbox, "systemctl")
  const curlLog = path.join(sandbox, "curl.log")
  const curl = path.join(sandbox, "curl")
  fs.writeFileSync(systemctl, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$SYSTEMCTL_LOG"\ncase "$1" in\n  is-active)\n    count_file="$SYSTEMCTL_LOG.is-active"\n    count=0\n    [ ! -f "$count_file" ] || count=$(cat "$count_file")\n    count=$((count + 1))\n    printf '%s\\n' "$count" > "$count_file"\n    states=\${SERVICE_STATES:-\${SERVICE_ACTIVE:+active}}\n    state=$(printf '%s' "$states" | cut -d, -f"$count")\n    [ -n "$state" ] || state=$(printf '%s' "$states" | awk -F, '{print $NF}')\n    printf '%s\\n' "\${state:-inactive}"\n    [ "$state" = active ] && exit 0\n    [ "$state" = inactive ] && exit 3\n    exit 1\n    ;;\n  stop) [ "$STOP_FAIL" != true ] ;;\n  start) [ "$START_FAIL" != true ] ;;\nesac\n`)
  fs.chmodSync(systemctl, 0o755)
  fs.writeFileSync(curl, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CURL_LOG"\ncount_file="$CURL_LOG.count"\ncount=0\n[ ! -f "$count_file" ] || count=$(cat "$count_file")\ncount=$((count + 1))\nprintf '%s\\n' "$count" > "$count_file"\nresponses=\${HEALTH_RESPONSES:-healthy}\nresponse=$(printf '%s' "$responses" | cut -d, -f"$count")\n[ -n "$response" ] || response=$(printf '%s' "$responses" | awk -F, '{print $NF}')\ncase "$response" in\n  healthy) printf '%s\\n' '{"mimo":{"healthy":true}}' ;;\n  unhealthy) printf '%s\\n' '{"mimo":{"healthy":false}}' ;;\n  invalid) printf '%s\\n' 'not json' ;;\n  error) exit 7 ;;\nesac\n`)
  fs.chmodSync(curl, 0o755)
  const invoke = (action, extra = {}) => {
    fs.rmSync(`${log}.is-active`, { force: true })
    fs.rmSync(`${curlLog}.count`, { force: true })
    return spawnSync("sh", ["scripts/backup-service-state.sh", action], {
      cwd: root,
      env: { ...process.env, MIMO_REUSE_EXISTING: "false", MIMO_BACKUP_MARKER: marker, MIMO_BACKUP_OPERATION_ID: "operation-a", MIMO_BACKUP_HEALTH_ATTEMPTS: "3", MIMO_BACKUP_HEALTH_INTERVAL: "0", SYSTEMCTL: systemctl, SYSTEMCTL_LOG: log, CURL: curl, CURL_LOG: curlLog, SERVICE_STATES: ["restore", "recover"].includes(action) ? "active" : undefined, ...extra },
      encoding: "utf8",
    })
  }
  try {
    assert.equal(invoke("prepare", { SERVICE_STATES: "active,inactive" }).status, 0)
    assert.equal(fs.statSync(marker).mode & 0o777, 0o600)
    assert.equal(invoke("restore").status, 0)
    assert.equal(fs.existsSync(marker), false)
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["is-active mimo-code-webui.service", "stop mimo-code-webui.service", "is-active mimo-code-webui.service", "start mimo-code-webui.service", "is-active mimo-code-webui.service"])

    fs.writeFileSync(log, "")
    assert.notEqual(invoke("prepare", { MIMO_REUSE_EXISTING: "true", SERVICE_ACTIVE: "true" }).status, 0)
    assert.equal(fs.existsSync(marker), false)
    assert.equal(fs.readFileSync(log, "utf8"), "")

    assert.equal(invoke("prepare", { SERVICE_STATES: "inactive" }).status, 0)
    assert.equal(invoke("restore").status, 0)
    assert.equal(fs.existsSync(marker), false)
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["is-active mimo-code-webui.service"])

    for (const state of ["failed", "activating", "deactivating", "unknown"]) {
      fs.writeFileSync(log, "")
      const rejected = invoke("prepare", { SERVICE_STATES: state })
      assert.notEqual(rejected.status, 0, state)
      assert.match(rejected.stderr, /refusing backup from ambiguous service state/)
      assert.equal(fs.existsSync(marker), false)
      assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["is-active mimo-code-webui.service"])
    }

    fs.writeFileSync(log, "")
    const notStopped = invoke("prepare", { SERVICE_STATES: "active,failed" })
    assert.notEqual(notStopped.status, 0)
    assert.equal(fs.existsSync(marker), false)
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["is-active mimo-code-webui.service", "stop mimo-code-webui.service", "is-active mimo-code-webui.service"])

    fs.mkdirSync(path.dirname(marker), { recursive: true })
    const foreignMarker = '{"version":1,"operation_id":"operation-stale","healthy":true}\n'
    fs.writeFileSync(marker, foreignMarker)
    assert.notEqual(invoke("prepare", { SERVICE_STATES: "active,inactive" }).status, 0)
    assert.equal(fs.existsSync(marker), true)
    assert.equal(fs.readFileSync(marker, "utf8"), foreignMarker)

    fs.writeFileSync(log, "")
    fs.writeFileSync(marker, foreignMarker)
    const rejectedTakeover = invoke("run", {
      SERVICE_STATES: "active,inactive",
      START_FAIL: "true",
      MIMO_BACKUP_COMMAND: `printf '%s\\n' backup >> '${log}'`,
    })
    assert.notEqual(rejectedTakeover.status, 0)
    assert.equal(fs.readFileSync(marker, "utf8"), foreignMarker)
    assert.deepEqual(fs.readFileSync(log, "utf8"), "")

    fs.rmSync(marker)
    fs.writeFileSync(log, "")
    fs.rmSync(`${log}.is-active`, { force: true })
    assert.equal(invoke("prepare", { SERVICE_STATES: "active,inactive", STOP_FAIL: "true" }).status, 0)
    assert.equal(fs.existsSync(marker), true)
    assert.equal(invoke("restore").status, 0)
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["is-active mimo-code-webui.service", "stop mimo-code-webui.service", "is-active mimo-code-webui.service", "start mimo-code-webui.service", "is-active mimo-code-webui.service"])

    fs.writeFileSync(log, "")
    fs.rmSync(`${log}.is-active`, { force: true })
    assert.notEqual(invoke("prepare", { SERVICE_STATES: "active,active", STOP_FAIL: "true" }).status, 0)
    assert.equal(fs.existsSync(marker), false)
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["is-active mimo-code-webui.service", "stop mimo-code-webui.service", "is-active mimo-code-webui.service"])

    assert.equal(invoke("prepare", { SERVICE_STATES: "active,inactive" }).status, 0)
    assert.notEqual(invoke("restore", { START_FAIL: "true" }).status, 0)
    assert.equal(fs.existsSync(marker), true)
    assert.equal(invoke("restore").status, 0)
    assert.equal(fs.existsSync(marker), false)

    fs.writeFileSync(curlLog, "")
    assert.equal(invoke("prepare", { SERVICE_STATES: "active,inactive" }).status, 0)
    const unhealthyRestore = invoke("restore", { HEALTH_RESPONSES: "unhealthy,invalid,error" })
    assert.notEqual(unhealthyRestore.status, 0)
    assert.equal(fs.existsSync(marker), true)
    assert.equal(fs.readFileSync(curlLog, "utf8").trim().split("\n").length, 4)
    assert.equal(invoke("restore", { HEALTH_RESPONSES: "unhealthy,healthy" }).status, 0)
    assert.equal(fs.existsSync(marker), false)

    fs.writeFileSync(marker, foreignMarker)
    fs.writeFileSync(log, "")
    assert.notEqual(invoke("restore").status, 0)
    assert.equal(fs.readFileSync(marker, "utf8"), foreignMarker)
    assert.equal(fs.readFileSync(log, "utf8"), "")
    assert.equal(invoke("recover").status, 0)
    assert.equal(fs.existsSync(marker), false)

    fs.writeFileSync(marker, foreignMarker)
    fs.writeFileSync(log, "")
    assert.notEqual(invoke("restore", { MIMO_BACKUP_OPERATION_ID: "", INVOCATION_ID: "" }).status, 0)
    assert.equal(fs.readFileSync(marker, "utf8"), foreignMarker)
    assert.equal(fs.readFileSync(log, "utf8"), "")

    for (const invalidMarker of ["", "operation-stale\noperation-extra\n"]) {
      fs.writeFileSync(marker, invalidMarker)
      fs.writeFileSync(log, "")
      const invalid = invoke("prepare", { SERVICE_ACTIVE: "true" })
      assert.notEqual(invalid.status, 0)
      assert.match(invalid.stderr, /invalid backup restart marker/)
      assert.equal(fs.readFileSync(marker, "utf8"), invalidMarker)
      assert.equal(fs.readFileSync(log, "utf8"), "")
    }
    fs.rmSync(marker)

    for (const invalidOperationId of ["", " ", "operation a", "operation\na", "operation/a"]) {
      const originalMarker = '{"version":1,"operation_id":"operation-existing","healthy":true}\n'
      fs.writeFileSync(marker, originalMarker)
      fs.writeFileSync(log, "")
      const invalid = invoke("prepare", {
        SERVICE_ACTIVE: "true",
        MIMO_BACKUP_OPERATION_ID: invalidOperationId,
        INVOCATION_ID: "",
      })
      assert.notEqual(invalid.status, 0)
      assert.match(invalid.stderr, /invalid backup invocation ID/)
      assert.equal(fs.readFileSync(marker, "utf8"), originalMarker)
      assert.equal(fs.readFileSync(log, "utf8"), "")
    }
    fs.rmSync(marker)

    fs.writeFileSync(log, "")
    const lock = path.join(sandbox, "deploy.lock")
    const lockHolder = spawnSync("flock", [lock, "sleep", "1"], { timeout: 50 })
    assert.equal(lockHolder.error?.code, "ETIMEDOUT")
    const contended = invoke("run", { MIMO_BACKUP_LOCK_FILE: lock, BACKUP_COMMAND: "exit 0", SERVICE_STATES: "active,inactive" })
    assert.notEqual(contended.status, 0)
    assert.equal(fs.readFileSync(log, "utf8"), "")

    fs.writeFileSync(log, "")
    const sharedLockDirectory = path.join(sandbox, "shared-lock")
    const sharedLock = path.join(sharedLockDirectory, "deploy.lock")
    fs.mkdirSync(sharedLockDirectory, { mode: 0o711 })
    const sharedLockRun = invoke("run", { MIMO_BACKUP_LOCK_FILE: sharedLock, MIMO_BACKUP_COMMAND: "exit 0", SERVICE_STATES: "inactive" })
    assert.equal(sharedLockRun.status, 0, sharedLockRun.stderr)
    assert.equal(fs.statSync(sharedLockDirectory).mode & 0o777, 0o711)

    fs.writeFileSync(log, "")
    const absentLockDirectory = path.join(sandbox, "absent-lock")
    const absentLock = path.join(absentLockDirectory, "deploy.lock")
    const reused = invoke("run", { MIMO_REUSE_EXISTING: "true", MIMO_BACKUP_LOCK_FILE: absentLock, MIMO_BACKUP_COMMAND: "exit 0", SERVICE_STATES: "active,inactive" })
    assert.notEqual(reused.status, 0)
    assert.match(reused.stderr, /backup requires WebUI-owned MiMo processes; MIMO_REUSE_EXISTING=true/)
    assert.equal(fs.existsSync(absentLockDirectory), false)
    assert.equal(fs.existsSync(absentLock), false)
    assert.equal(fs.readFileSync(log, "utf8"), "")
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("upgrade refuses reused MiMo before service mutation", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-reuse-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-reuse-root-"))
  try {
    const releaseA = createRelease(fixture, "5.0.0")
    const releaseB = createRelease(fixture, "5.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    const config = path.join(sandbox, "etc/mimo-code-webui/webui.env")
    fs.appendFileSync(config, "MIMO_REUSE_EXISTING=true\n")
    fs.writeFileSync(path.join(sandbox, "systemctl.log"), "")
    const upgrade = run(sandbox, ["upgrade", "--archive", releaseB])
    assert.notEqual(upgrade.status, 0)
    assert.match(upgrade.stderr, /backup requires WebUI-owned MiMo processes; MIMO_REUSE_EXISTING=true/)
    assert.equal(fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8"), "")
    assert.match(currentRelease(sandbox), /^5\.0\.0-/)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("upgrade backup gate requires explicit break glass when unavailable", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-fixture-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-root-"))
  try {
    const releaseA = createRelease(fixture, "3.0.0")
    const releaseB = createRelease(fixture, "3.1.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", releaseA, "--mode", "reverse-proxy"]).status, 0)
    const current = fs.realpathSync(path.join(sandbox, "opt/mimo-code-webui/current"))
    fs.rmSync(path.join(current, "scripts/backup-state.mjs"))
    const blocked = run(sandbox, ["upgrade", "--archive", releaseB])
    assert.notEqual(blocked.status, 0)
    assert.match(blocked.stderr, /backup gate unavailable/)
    assert.match(currentRelease(sandbox), /^3\.0\.0-/)
    const recoveryMarker = path.join(sandbox, "var/lib/mimo-code-webui/deployment-recovery-required")
    if (fs.existsSync(recoveryMarker)) fs.rmSync(recoveryMarker)
    fs.rmSync(path.join(sandbox, "var/lib/mimo-code-webui/deployment-transactions"), { recursive: true, force: true })
    const bypassed = run(sandbox, ["upgrade", "--archive", releaseB, "--break-glass-skip-backup"])
    assert.equal(bypassed.status, 0, bypassed.stderr)
    assert.match(bypassed.stdout, /BREAK GLASS/)
    assert.match(currentRelease(sandbox), /^3\.1\.0-/)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})

test("purge preserves data unless a healthy backup or break glass exists", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-fixture-"))
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-deploy-root-"))
  try {
    const release = createRelease(fixture, "4.0.0")
    assert.equal(run(sandbox, ["install", "--non-interactive", "--yes", "--archive", release, "--mode", "reverse-proxy"]).status, 0)
    const blocked = run(sandbox, ["uninstall", "--purge", "--yes", "--non-interactive"])
    assert.notEqual(blocked.status, 0)
    assert.match(blocked.stderr, /purge requires a recent verified external backup/)
    assert.equal(fs.existsSync(path.join(sandbox, "var/lib/mimo-code-webui")), true)
    const bypassed = run(sandbox, ["uninstall", "--purge", "--yes", "--non-interactive", "--break-glass-skip-backup"])
    assert.equal(bypassed.status, 0, bypassed.stderr)
    assert.match(bypassed.stdout, /BREAK GLASS/)
    assert.equal(fs.existsSync(path.join(sandbox, "var/lib/mimo-code-webui")), false)
    assert.equal(fs.existsSync(path.join(sandbox, "srv/mimo-code-workspaces")), true)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
})
