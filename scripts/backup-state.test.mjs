import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-backup-"))
const config = path.join(root, "config")
const state = path.join(root, "state")
const data = path.join(root, "data")
const runtimeState = path.join(root, "runtime-state")
const backups = path.join(root, "backups")
const status = path.join(root, "backup-status.json")
fs.mkdirSync(config)
fs.mkdirSync(state)
fs.mkdirSync(data)
fs.mkdirSync(runtimeState)
fs.writeFileSync(path.join(config, "webui.env"), "HOST=127.0.0.1\n")
fs.mkdirSync(path.join(config, "node_modules", ".bin"), { recursive: true })
fs.symlinkSync("../tool.js", path.join(config, "node_modules", ".bin", "tool"))
fs.writeFileSync(path.join(state, "memory.md"), "durable memory\n")
fs.writeFileSync(path.join(data, "history.json"), "[]\n")
fs.writeFileSync(path.join(runtimeState, "runtime.json"), "{}\n")
const env = { ...process.env, MIMO_REUSE_EXISTING: "false", MIMO_BACKUP_ROOT: backups, MIMO_BACKUP_STATUS_FILE: status, MIMO_WEBUI_CONFIG_DIR: config, MIMO_CONFIG_DIR: path.join(root, "missing-config"), MIMO_DATA_DIR: data, MIMO_RUNTIME_STATE_DIR: runtimeState, MIMO_STATE_DIR: state }

try {
  const reuseRoot = path.join(root, "reuse-backups")
  const reuseStatus = path.join(root, "reuse-status.json")
  const reuse = spawnSync(process.execPath, ["scripts/backup-state.mjs"], {
    cwd: process.cwd(),
    env: { ...env, MIMO_REUSE_EXISTING: "true", MIMO_BACKUP_ROOT: reuseRoot, MIMO_BACKUP_STATUS_FILE: reuseStatus },
    encoding: "utf8",
  })
  assert.notEqual(reuse.status, 0)
  assert.match(reuse.stderr, /backup requires WebUI-owned MiMo processes; MIMO_REUSE_EXISTING=true/)
  assert.equal(fs.existsSync(reuseRoot), false)
  assert.equal(fs.existsSync(reuseStatus), false)

  const sqlite = await import("node:sqlite").catch(() => null)
  if (sqlite) {
    const database = new sqlite.DatabaseSync(path.join(state, "mimocode.db"))
    database.exec("PRAGMA foreign_keys=ON; CREATE TABLE sessions(id TEXT PRIMARY KEY); CREATE TABLE messages(id TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id)); INSERT INTO sessions VALUES ('s1'); INSERT INTO messages VALUES ('m1', 's1');")
    database.close()
  } else {
    fs.writeFileSync(path.join(state, "mimocode.db"), "sqlite fixture requires external VM validation")
  }
  env.MIMO_BACKUP_OFFLINE = "true"
  const success = spawnSync(process.execPath, ["scripts/backup-state.mjs"], { cwd: process.cwd(), env, encoding: "utf8" })
  assert.equal(success.status, 0, success.stderr)
  const backup = fs.readdirSync(backups).filter((name) => !name.startsWith("."))[0]
  const backupPath = path.join(backups, backup)
  assert.equal(fs.readFileSync(path.join(backupPath, "mimo-data", "history.json"), "utf8"), "[]\n")
  assert.equal(fs.readFileSync(path.join(backupPath, "mimo-runtime-state", "runtime.json"), "utf8"), "{}\n")
  assert.equal(fs.existsSync(path.join(backupPath, "webui-config", "node_modules")), false)
  assert.equal(spawnSync(process.execPath, ["scripts/backup-state.mjs", "verify", backupPath], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  const restore = path.join(root, "restore")
  const restored = spawnSync(process.execPath, ["scripts/backup-state.mjs", "restore", backupPath, restore], { cwd: process.cwd(), env, encoding: "utf8" })
  assert.equal(restored.status, 0, restored.stderr)
  if (sqlite) {
    const restoredDatabase = new sqlite.DatabaseSync(path.join(restore, "mimo-state", "mimocode.db"))
    assert.equal(restoredDatabase.prepare("PRAGMA integrity_check").get().integrity_check, "ok")
    assert.equal(restoredDatabase.prepare("PRAGMA foreign_key_check").all().length, 0)
    assert.equal(restoredDatabase.prepare("SELECT count(*) AS count FROM messages").get().count, 1)
    restoredDatabase.exec("INSERT INTO messages VALUES ('m2', 's1')")
    assert.equal(restoredDatabase.prepare("SELECT count(*) AS count FROM messages").get().count, 2)
    restoredDatabase.close()
  }
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs", "restore", backupPath, restore], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  fs.appendFileSync(path.join(backupPath, "mimo-state", "memory.md"), "corrupt")
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs", "verify", backupPath], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  fs.writeFileSync(path.join(backupPath, "unexpected"), "not listed")
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs", "verify", backupPath], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  fs.rmSync(path.join(backupPath, "unexpected"))
  const manifestPath = path.join(backupPath, "backup-manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.schemaVersion = 0
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs", "verify", backupPath], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  fs.rmSync(manifestPath)
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs", "verify", backupPath], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  delete env.MIMO_BACKUP_OFFLINE
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs"], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  const failedStatus = JSON.parse(fs.readFileSync(status, "utf8"))
  assert.equal(failedStatus.state, "degraded")
  assert.equal(typeof failedStatus.lastSuccessAt, "string")
  assert.equal(fs.readdirSync(backups).filter((name) => !name.startsWith(".")).length, 1)
  assert.equal(fs.readdirSync(backups).some((name) => name.startsWith(".backup-")), false)
  fs.mkdirSync(path.join(backups, "old-backup"))
  env.MIMO_BACKUP_KEEP = "1"
  fs.rmSync(path.join(state, "mimocode.db"))
  const retained = spawnSync(process.execPath, ["scripts/backup-state.mjs"], { cwd: process.cwd(), env, encoding: "utf8" })
  assert.equal(retained.status, 0, retained.stderr)
  assert.equal(fs.readdirSync(backups).filter((name) => !name.startsWith(".")).length, 1)
  delete env.MIMO_BACKUP_KEEP
  fs.symlinkSync("memory.md", path.join(state, "linked-memory"))
  assert.notEqual(spawnSync(process.execPath, ["scripts/backup-state.mjs"], { cwd: process.cwd(), env, encoding: "utf8" }).status, 0)
  assert.equal(fs.readdirSync(backups).some((name) => name.startsWith(".backup-")), false)
  console.log("backup state tests passed")
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
