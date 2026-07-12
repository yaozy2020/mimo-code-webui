import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8")

test("systemd leaves runtime settings to the environment file", () => {
  const unit = read("deploy/systemd/mimo-code-webui.service")
  assert.match(unit, /^EnvironmentFile=\/etc\/mimo-code-webui\/webui\.env$/m)
  assert.doesNotMatch(unit, /^Environment=(HOST|PORT|MIMO_)/m)
  assert.match(unit, /^ExecStart=\/opt\/mimo-code-webui\/current\/scripts\/start\.sh$/m)
  assert.match(unit, /^OnFailure=mimo-code-webui-alert@%n\.service$/m)
  const backupUnit = read("deploy/systemd/mimo-code-webui-backup.service")
  assert.match(backupUnit, /^OnFailure=mimo-code-webui-alert@%n\.service$/m)
  assert.match(backupUnit, /^ExecStart=\/usr\/bin\/env MIMO_BACKUP_OPERATION_ID=\$\{INVOCATION_ID\} \/opt\/mimo-code-webui\/current\/scripts\/backup-service-state\.sh run$/m)
  assert.match(backupUnit, /^ExecStopPost=\/usr\/bin\/env MIMO_BACKUP_OPERATION_ID=\$\{INVOCATION_ID\} \/opt\/mimo-code-webui\/current\/scripts\/backup-service-state\.sh restore$/m)
  assert.doesNotMatch(backupUnit, /systemctl stop/)
  assert.doesNotMatch(backupUnit, /ExecStopPost=.*systemctl start/)
  assert.doesNotMatch(backupUnit, /ExecStopPost=.*(?:chgrp|chmod)/)
  const alertUnit = read("deploy/systemd/mimo-code-webui-alert@.service")
  assert.match(alertUnit, /^EnvironmentFile=-\/etc\/mimo-code-webui\/alert\.env$/m)
})

test("strict startup checks artifacts and dependency resolution", () => {
  const script = read("scripts/start.sh")
  assert.match(script, /web\/dist\/index\.html/)
  assert.match(script, /server\/dist\/index\.js/)
  assert.match(script, /import\("express"\)/)
  assert.doesNotMatch(script, /for required_path in "node_modules" "web\/node_modules"/)
})

test("deployment CLI enforces archive and health safety", () => {
  const script = read("deploy/mimo-code-webui")
  assert.notEqual(fs.statSync(path.join(root, "deploy/mimo-code-webui")).mode & 0o111, 0, "deployment CLI must be executable")
  assert.match(script, /checksum sidecar not found/)
  assert.match(script, /--public-key is required/)
  assert.match(script, /release signature verification failed/)
  assert.match(script, /unsafe archive member/)
  assert.match(script, /s\.mimo\?\.healthy === true/)
  assert.match(script, /restored previous release/)
  assert.match(script, /AUTH_TOKEN=configured/)
  assert.doesNotMatch(script, /systemctl_cmd enable mimo-code-webui-backup\.timer/)
  assert.match(script, /systemctl enable --now mimo-code-webui-backup\.timer/)
  assert.match(script, /disable --now mimo-code-webui-backup\.timer/)
  assert.doesNotMatch(script, /ALLOW_UNAUTHENTICATED_LAN/)
})

test("release packaging includes installer and checksum", () => {
  const script = read("scripts/package-release.mjs")
  assert.match(script, /deploy\/mimo-code-webui/)
  assert.match(script, /deploy\/rollback-safety-contract-v1/)
  assert.match(script, /sha256sum/)
  assert.match(script, /\.sha256/)
  assert.match(script, /RELEASE_SIGNING_KEY/)
  assert.match(script, /pkeyutl/)
  assert.match(script, /release-manifest\.json/)
  assert.match(script, /scripts\/backup-state\.mjs/)
  assert.match(script, /copy\("scripts\/backup-state\.mjs"\)/)
  assert.match(script, /copy\("scripts\/backup-service-state\.sh"\)/)
  assert.match(script, /mimo-code-webui-backup\.timer/)
  assert.match(script, /mimo-code-webui-alert@\.service/)
  assert.match(script, /scripts\/send-alert\.sh/)
  assert.match(script, /dirty tracked worktree/)
  assert.match(script, /approved release branch main/)
  assert.match(script, /annotated or signed tag/)
  assert.match(script, /\.unsigned/)
  assert.match(script, /--sort=name/)
  assert.match(script, /--numeric-owner/)
  assert.match(script, /use-compress-program=gzip -n/)
  assert.doesNotMatch(script, /copy\("scripts\/run-source\.sh"/)
  assert.doesNotMatch(script, /copy\("scripts\/recover-memory\.sh"/)
})

test("formal release packaging enforces signed provenance and supports explicit unsigned development artifacts", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-release-provenance-"))
  const signingKey = path.join(fixture, "release.key")
  const run = (args = [], env = {}) => spawnSync(process.execPath, [path.join(root, "scripts/package-release.mjs"), ...args], {
    cwd: fixture,
    env: { ...process.env, RELEASE_ROOT: fixture, ...env },
    encoding: "utf8",
  })
  try {
    fs.cpSync(path.join(root, "scripts/package-release.mjs"), path.join(fixture, "package-release.mjs"))
    fs.mkdirSync(path.join(fixture, "scripts"), { recursive: true })
    fs.mkdirSync(path.join(fixture, "docs"), { recursive: true })
    fs.mkdirSync(path.join(fixture, "deploy/systemd"), { recursive: true })
    fs.mkdirSync(path.join(fixture, "server"), { recursive: true })
    fs.mkdirSync(path.join(fixture, "web"), { recursive: true })
    fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({
      name: "mimo-code-webui",
      version: "1.2.3",
      scripts: { build: "node build.mjs" },
      workspaces: ["server", "web"],
    }))
    fs.writeFileSync(path.join(fixture, "package-lock.json"), JSON.stringify({
      name: "mimo-code-webui",
      version: "1.2.3",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "mimo-code-webui", version: "1.2.3", workspaces: ["server", "web"] },
        server: { name: "server", version: "1.0.0" },
        web: { name: "web", version: "1.0.0" },
        "node_modules/server": { resolved: "server", link: true },
        "node_modules/web": { resolved: "web", link: true },
      },
    }))
    fs.writeFileSync(path.join(fixture, "build.mjs"), `
      import fs from "node:fs"
      fs.mkdirSync("web/dist", { recursive: true })
      fs.mkdirSync("server/dist", { recursive: true })
      const tracked = fs.readFileSync("tracked-input.txt", "utf8")
      const untracked = fs.existsSync("untracked-required.txt") ? fs.readFileSync("untracked-required.txt", "utf8") : ""
      fs.writeFileSync("web/dist/index.html", tracked + untracked)
      fs.writeFileSync("server/dist/index.js", "export default " + JSON.stringify(tracked + untracked))
    `)
    fs.writeFileSync(path.join(fixture, "tracked-input.txt"), "tracked commit input\n")
    fs.writeFileSync(path.join(fixture, "README.md"), "fixture\n")
    fs.writeFileSync(path.join(fixture, ".env.example"), "FIXTURE=true\n")
    fs.writeFileSync(path.join(fixture, "docs/deployment.md"), "fixture\n")
    fs.writeFileSync(path.join(fixture, "server/package.json"), JSON.stringify({ name: "server", version: "1.0.0" }))
    fs.writeFileSync(path.join(fixture, "web/package.json"), JSON.stringify({ name: "web", version: "1.0.0" }))
    for (const script of ["start.sh", "backup-service-state.sh", "send-alert.sh"]) fs.writeFileSync(path.join(fixture, `scripts/${script}`), "#!/bin/sh\n")
    for (const script of ["start.bat", "backup-state.mjs"]) fs.writeFileSync(path.join(fixture, `scripts/${script}`), "fixture\n")
    fs.copyFileSync(path.join(root, "deploy/mimo-code-webui"), path.join(fixture, "deploy/mimo-code-webui"))
    fs.copyFileSync(path.join(root, "deploy/rollback-safety-contract-v1"), path.join(fixture, "deploy/rollback-safety-contract-v1"))
    for (const unit of ["mimo-code-webui.service", "mimo-code-webui-backup.service", "mimo-code-webui-backup.timer", "mimo-code-webui-alert@.service"]) {
      fs.writeFileSync(path.join(fixture, `deploy/systemd/${unit}`), "fixture\n")
    }
    spawnSync("git", ["init", "-b", "main"], { cwd: fixture })
    spawnSync("git", ["config", "user.name", "Release Test"], { cwd: fixture })
    spawnSync("git", ["config", "user.email", "release@example.invalid"], { cwd: fixture })
    spawnSync("git", ["add", "."], { cwd: fixture })
    spawnSync("git", ["commit", "-m", "fixture"], { cwd: fixture })

    const missingKey = run(["--release"])
    assert.notEqual(missingKey.status, 0)
    assert.match(missingKey.stderr, /RELEASE_SIGNING_KEY is required/)

    spawnSync("openssl", ["genpkey", "-algorithm", "ED25519", "-out", signingKey])
    fs.chmodSync(signingKey, 0o600)

    fs.chmodSync(signingKey, 0o640)
    const broadKey = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(broadKey.status, 0)
    assert.match(broadKey.stderr, /mode 0600 or stricter/)
    fs.chmodSync(signingKey, 0o600)

    const keyLink = path.join(fixture, "release-link.key")
    fs.symlinkSync(signingKey, keyLink)
    const linkedKey = run(["--release"], { RELEASE_SIGNING_KEY: keyLink })
    assert.notEqual(linkedKey.status, 0)
    assert.match(linkedKey.stderr, /regular file.*not a symlink/)

    const keyDirectory = path.join(fixture, "release-key-dir")
    fs.mkdirSync(keyDirectory)
    fs.chmodSync(keyDirectory, 0o600)
    const directoryKey = run(["--release"], { RELEASE_SIGNING_KEY: keyDirectory })
    assert.notEqual(directoryKey.status, 0)
    assert.match(directoryKey.stderr, /regular file.*not a symlink/)
    const missingTag = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(missingTag.status, 0)
    assert.match(missingTag.stderr, /annotated or signed tag/)

    spawnSync("git", ["tag", "v1.2.3"], { cwd: fixture })
    const lightweight = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(lightweight.status, 0)
    assert.match(lightweight.stderr, /annotated or signed/)
    spawnSync("git", ["tag", "-d", "v1.2.3"], { cwd: fixture })

    spawnSync("git", ["tag", "-a", "v9.9.9", "-m", "wrong"], { cwd: fixture })
    const mismatch = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(mismatch.status, 0)
    assert.match(mismatch.stderr, /v1\.2\.3/)
    spawnSync("git", ["tag", "-d", "v9.9.9"], { cwd: fixture })

    fs.writeFileSync(path.join(fixture, "tracked.txt"), "dirty\n")
    spawnSync("git", ["add", "tracked.txt"], { cwd: fixture })
    spawnSync("git", ["commit", "-m", "tracked"], { cwd: fixture })
    spawnSync("git", ["tag", "-a", "v1.2.3", "-m", "release"], { cwd: fixture })
    fs.writeFileSync(path.join(fixture, "tracked.txt"), "changed\n")
    const dirty = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(dirty.status, 0)
    assert.match(dirty.stderr, /tracked worktree/)

    spawnSync("git", ["restore", "tracked.txt"], { cwd: fixture })
    spawnSync("git", ["switch", "-c", "release-test"], { cwd: fixture })
    const wrongBranch = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(wrongBranch.status, 0)
    assert.match(wrongBranch.stderr, /approved release branch main/)

    spawnSync("git", ["switch", "main"], { cwd: fixture })

    spawnSync("git", ["tag", "-d", "v1.2.3"], { cwd: fixture })
    spawnSync("git", ["tag", "-a", "v1.2.3", "HEAD~1", "-m", "stale"], { cwd: fixture })
    const staleTag = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(staleTag.status, 0)
    assert.match(staleTag.stderr, /must point at HEAD|HEAD must have/)
    spawnSync("git", ["tag", "-d", "v1.2.3"], { cwd: fixture })
    spawnSync("git", ["tag", "-a", "v1.2.3", "-m", "release"], { cwd: fixture })

    fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "mimo-code-webui", version: "--help" }))
    spawnSync("git", ["add", "package.json"], { cwd: fixture })
    spawnSync("git", ["commit", "-m", "ambiguous version"], { cwd: fixture })
    const ambiguous = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.notEqual(ambiguous.status, 0)
    assert.match(ambiguous.stderr, /safe semantic version/)
    spawnSync("git", ["reset", "--hard", "HEAD~1"], { cwd: fixture })

    fs.writeFileSync(path.join(fixture, "untracked-required.txt"), "UNTRACKED BUILD INPUT\n")
    fs.writeFileSync(path.join(fixture, "deploy/untracked-extra"), "UNTRACKED DEPLOY FILE\n")
    fs.mkdirSync(path.join(fixture, "web/dist"), { recursive: true })
    fs.mkdirSync(path.join(fixture, "server/dist"), { recursive: true })
    fs.writeFileSync(path.join(fixture, "web/dist/index.html"), "FAKE WORKTREE DIST\n")
    fs.writeFileSync(path.join(fixture, "server/dist/index.js"), "FAKE WORKTREE DIST\n")
    const formalArtifact = run(["--release"], { RELEASE_SIGNING_KEY: signingKey })
    assert.equal(formalArtifact.status, 0, formalArtifact.stderr)
    const archive = path.join(fixture, "dist-release/mimo-code-webui-v1.2.3.tar.gz")
    const publicKey = path.join(fixture, "release.pub")
    assert.equal(spawnSync("openssl", ["pkey", "-in", signingKey, "-pubout", "-out", publicKey]).status, 0)
    assert.equal(spawnSync("openssl", ["pkeyutl", "-verify", "-pubin", "-inkey", publicKey, "-rawin", "-in", archive, "-sigfile", `${archive}.sig`]).status, 0)
    assert.equal(spawnSync("sha256sum", ["-c", `${archive}.sha256`], { cwd: path.dirname(archive) }).status, 0)
    const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: fixture, encoding: "utf8" }).stdout.trim()
    const manifest = JSON.parse(spawnSync("tar", ["-xOf", archive, "mimo-code-webui-v1.2.3/release-manifest.json"], { encoding: "utf8" }).stdout)
    assert.equal(manifest.gitCommit, commit)
    assert.equal(manifest.version, "1.2.3")
    assert.equal(manifest.dirty, false)
    const members = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" }).stdout
    assert.doesNotMatch(members, /untracked-extra/)
    const bundledWeb = spawnSync("tar", ["-xOf", archive, "mimo-code-webui-v1.2.3/web/dist/index.html"], { encoding: "utf8" }).stdout
    assert.equal(bundledWeb, "tracked commit input\n")
    assert.doesNotMatch(bundledWeb, /UNTRACKED BUILD INPUT|FAKE WORKTREE DIST/)
    const verified = spawnSync(path.join(root, "deploy/mimo-code-webui"), ["verify-archive", "--archive", archive, "--public-key", publicKey], { encoding: "utf8" })
    assert.equal(verified.status, 0, verified.error?.message ?? verified.stderr)

    const offlineBin = path.join(fixture, "offline-bin")
    fs.mkdirSync(offlineBin)
    for (const command of ["bash", "node", "tar", "gzip", "sha256sum", "openssl", "readlink", "awk", "find", "mktemp", "rm", "basename"]) {
      const executable = command === "node" ? process.execPath : spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" }).stdout.trim()
      assert.notEqual(executable, "", `${command} is required for the offline verification fixture`)
      fs.symlinkSync(executable, path.join(offlineBin, command))
    }
    const offlineVerified = spawnSync(path.join(root, "deploy/mimo-code-webui"), ["verify-archive", "--archive", archive, "--public-key", publicKey], {
      encoding: "utf8",
      env: { ...process.env, PATH: offlineBin },
    })
    assert.equal(offlineVerified.status, 0, offlineVerified.stderr)

    const unsignedArtifact = run(["--unsigned"])
    assert.equal(unsignedArtifact.status, 0, unsignedArtifact.stderr)
    const unsignedArchive = path.join(fixture, "dist-release/mimo-code-webui-v1.2.3.unsigned.tar.gz")
    assert.equal(fs.existsSync(`${unsignedArchive}.sig`), false)
    const rejectedUnsigned = spawnSync(path.join(root, "deploy/mimo-code-webui"), ["verify-archive", "--archive", unsignedArchive, "--public-key", publicKey], { encoding: "utf8" })
    assert.notEqual(rejectedUnsigned.status, 0)
    assert.match(rejectedUnsigned.stderr, /release signature not found/)

    const valid = run(["--release", "--provenance-only"], { RELEASE_SIGNING_KEY: signingKey })
    assert.equal(valid.status, 0, valid.stderr)
    assert.match(valid.stdout, /formal release provenance verified/)

    const unsigned = run(["--unsigned", "--provenance-only"])
    assert.equal(unsigned.status, 0, unsigned.stderr)
    assert.match(unsigned.stdout, /development unsigned packaging/)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test("upgrade rejects install-only configuration flags", () => {
  const script = read("deploy/mimo-code-webui")
  assert.match(script, /SEEN_INSTALL_OPTION=true/)
  assert.match(script, /upgrade preserves runtime configuration/)
  assert.match(script, /backup_before_upgrade/)
  assert.match(script, /BREAK GLASS: upgrade backup gate explicitly bypassed/)
  const deploy = script.indexOf("deploy_release()")
  const snapshot = script.indexOf("snapshot_upgrade_state", deploy)
  const transaction = script.indexOf("TRANSACTION_ACTIVE=true", deploy)
  const backup = script.indexOf("backup_before_upgrade", transaction)
  assert.ok(snapshot >= 0 && transaction > snapshot && backup > transaction)
  assert.match(script, /manifest\.tmp/)
  assert.doesNotMatch(script, /\.present"/)
  assert.match(script, /old release failed to recover after pre-upgrade backup/)
})

test("failed first install has an explicit compensation path", () => {
  const script = read("deploy/mimo-code-webui")
  assert.match(script, /cleanup_failed_install/)
  assert.match(script, /systemctl_cmd disable --now/)
  assert.match(script, /trap cleanup_failed_install EXIT/)
  assert.match(script, /manifest mismatch/)
  assert.match(script, /set_owner -R "\$SERVICE_USER":"\$SERVICE_USER" "\$STATE_ROOT"/)
  assert.match(script, /set_owner "\$SERVICE_USER":"\$SERVICE_USER" "\$WORKSPACE_ROOT"/)
  assert.match(script, /find "\$extracted" -type d -exec chmod 0755/)
})

test("source runner has safe defaults and no database cleanup", () => {
  const script = read("scripts/run-source.sh")
  assert.match(script, /HOST:-127\.0\.0\.1/)
  assert.match(script, /PORT:-8080/)
  assert.doesNotMatch(script, /AUTH_TOKEN:-mimo/)
  assert.doesNotMatch(script, /clean-db-locks|mimocode\.db-(wal|shm)|stop_port/)
  assert.doesNotMatch(script, /nohup mimo serve/)
  assert.equal(fs.existsSync(path.join(root, "scripts/recover-memory.sh")), false)
  assert.equal(fs.existsSync(path.join(root, "scripts/mimo-watchdog.sh")), false)
})

test("source runner rejects unauthenticated LAN before startup", () => {
  const result = spawnSync("bash", ["scripts/run-source.sh"], {
    cwd: root,
    env: { ...process.env, HOST: "0.0.0.0", AUTH_TOKEN: "", ALLOW_UNAUTHENTICATED_LAN: "false" },
    encoding: "utf8",
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /AUTH_TOKEN is required/)
})

test("source runner help documents owned-process restart", () => {
  const result = spawnSync("bash", ["scripts/run-source.sh", "--help"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /HOST=127\.0\.0\.1/)
  assert.match(result.stdout, /previously started\s+by this checkout/)
  assert.doesNotMatch(result.stdout, /clean-db-locks|--recover/)
})

test("source runner refuses to stop a process it does not own", async () => {
  const child = spawn("sleep", ["30"], { stdio: "ignore" })
  const pidFile = path.join(root, `.run-source-test-${process.pid}.pid`)
  try {
    const stat = fs.readFileSync(`/proc/${child.pid}/stat`, "utf8").trim().split(/\s+/)
    fs.writeFileSync(pidFile, `${child.pid}\t${stat[21]}\t${root}\n`)
    const result = spawnSync("bash", ["scripts/run-source.sh", "--restart", "--daemon"], {
      cwd: root,
      env: { ...process.env, WEBUI_PID_FILE: pidFile },
      encoding: "utf8",
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /ownership check failed/)
    assert.equal(child.exitCode, null)
  } finally {
    fs.rmSync(pidFile, { force: true })
    child.kill("SIGTERM")
  }
})

test("source runner refuses to claim an existing healthy WebUI", async () => {
  const serverScript = `
    const http = require("node:http");
    const server = http.createServer((req, res) => {
      if (req.url === "/status") { res.writeHead(200, {"content-type":"application/json"}); res.end("{}"); return; }
      res.writeHead(404); res.end();
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
  `
  const child = spawn(process.execPath, ["-e", serverScript], { stdio: ["ignore", "pipe", "ignore"] })
  try {
    const port = await new Promise((resolve, reject) => {
      child.stdout.once("data", (chunk) => resolve(String(chunk).trim()))
      child.once("error", reject)
    })
    const result = spawnSync("bash", ["scripts/run-source.sh", "--daemon"], {
      cwd: root,
      env: { ...process.env, PORT: port },
      encoding: "utf8",
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /already serves a healthy instance/)
    assert.equal(child.exitCode, null)
  } finally {
    child.kill("SIGTERM")
  }
})
