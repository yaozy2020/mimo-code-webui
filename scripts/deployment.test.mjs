import assert from "node:assert/strict"
import fs from "node:fs"
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
  assert.match(script, /checksum sidecar not found/)
  assert.match(script, /unsafe archive member/)
  assert.match(script, /s\.mimo\?\.healthy === true/)
  assert.match(script, /restored previous release/)
  assert.match(script, /AUTH_TOKEN=configured/)
  assert.doesNotMatch(script, /ALLOW_UNAUTHENTICATED_LAN/)
})

test("release packaging includes installer and checksum", () => {
  const script = read("scripts/package-release.mjs")
  assert.match(script, /deploy\/mimo-code-webui/)
  assert.match(script, /sha256sum/)
  assert.match(script, /\.sha256/)
  assert.match(script, /release-manifest\.json/)
  assert.match(script, /scripts\/backup-state\.mjs/)
  assert.match(script, /copy\("scripts\/backup-state\.mjs"\)/)
  assert.match(script, /mimo-code-webui-backup\.timer/)
  assert.match(script, /Refusing to package a dirty worktree/)
  assert.match(script, /--sort=name/)
  assert.match(script, /--numeric-owner/)
  assert.match(script, /use-compress-program=gzip -n/)
  assert.doesNotMatch(script, /copy\("scripts\/run-source\.sh"/)
  assert.doesNotMatch(script, /copy\("scripts\/recover-memory\.sh"/)
})

test("upgrade rejects install-only configuration flags", () => {
  const script = read("deploy/mimo-code-webui")
  assert.match(script, /SEEN_INSTALL_OPTION=true/)
  assert.match(script, /upgrade preserves runtime configuration/)
  assert.match(script, /backup_before_upgrade/)
  assert.match(script, /BREAK GLASS: upgrade backup gate explicitly bypassed/)
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
