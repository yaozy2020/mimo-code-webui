import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const installer = path.join(root, "deploy/mimo-code-webui")
const unit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui.service"))
const backupServiceUnit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui-backup.service"))
const backupTimerUnit = fs.readFileSync(path.join(root, "deploy/systemd/mimo-code-webui-backup.timer"))
const backupScript = fs.readFileSync(path.join(root, "scripts/backup-state.mjs"))
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
    ["deploy/mimo-code-webui", fs.readFileSync(installer)],
    ["deploy/systemd/mimo-code-webui.service", unit],
    ["deploy/systemd/mimo-code-webui-backup.service", backupServiceUnit],
    ["deploy/systemd/mimo-code-webui-backup.timer", backupTimerUnit],
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
    env: { ...process.env, MIMO_DEPLOY_TEST_MODE: "1", MIMO_DEPLOY_TEST_ROOT: sandbox, ...extraEnv },
    encoding: "utf8",
  })
}

process.on("exit", () => fs.rmSync(signingDirectory, { recursive: true, force: true }))

function currentRelease(sandbox) {
  const link = path.join(sandbox, "opt/mimo-code-webui/current")
  return fs.existsSync(link) ? path.basename(fs.realpathSync(link)) : null
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
    fs.writeFileSync(healthFile, "unhealthy\nhealthy\n")
    const failedUpgrade = run(sandbox, ["upgrade", "--archive", releaseB], { MIMO_DEPLOY_TEST_HEALTH_FILE: healthFile })
    assert.notEqual(failedUpgrade.status, 0)
    assert.equal(currentRelease(sandbox), installedA)
    assert.equal(fs.existsSync(previousBefore), false)
    assert.deepEqual(fs.readFileSync(path.join(sandbox, "etc/systemd/system/mimo-code-webui.service")), unitBefore)
    assert.deepEqual(fs.readFileSync(path.join(sandbox, "etc/mimo-code-webui/webui.env")), configBefore)
    const calls = fs.readFileSync(path.join(sandbox, "systemctl.log"), "utf8").trim().split("\n")
    assert.deepEqual(calls, ["stop mimo-code-webui", "start mimo-code-webui", "daemon-reload", "enable mimo-code-webui", "enable mimo-code-webui-backup.timer", "restart mimo-code-webui", "daemon-reload", "restart mimo-code-webui", "daemon-reload", "restart mimo-code-webui"])
    fs.rmSync(sandbox, { recursive: true, force: true })
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
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
