#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const backupRoot = path.resolve(process.env.MIMO_BACKUP_ROOT || "/var/backups/mimo-code-webui")
const statusFile = path.resolve(process.env.MIMO_BACKUP_STATUS_FILE || "/var/lib/mimo-code-webui/backup-status.json")
const sources = [
  ["webui-config", process.env.MIMO_WEBUI_CONFIG_DIR || "/etc/mimo-code-webui"],
  ["mimo-config", process.env.MIMO_CONFIG_DIR || "/var/lib/mimo-code-webui/home/.config/mimocode"],
  ["mimo-data", process.env.MIMO_DATA_DIR || "/var/lib/mimo-code-webui/data"],
  ["mimo-runtime-state", process.env.MIMO_RUNTIME_STATE_DIR || "/var/lib/mimo-code-webui/state"],
  ["mimo-state", process.env.MIMO_STATE_DIR || "/var/lib/mimo-code-webui/home/.local/share/mimocode"],
]
const offline = process.env.MIMO_BACKUP_OFFLINE === "true"
let staging = ""

function verifyBackup(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "backup-manifest.json"), "utf8"))
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("unsupported backup manifest")
  const expected = new Set(manifest.files.map((entry) => entry.path))
  const actual = filesUnder(root).map((file) => path.relative(root, file)).filter((file) => file !== "backup-manifest.json")
  if (actual.length !== expected.size || actual.some((file) => !expected.has(file))) throw new Error("backup file set does not match manifest")
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || entry.path.startsWith("/") || entry.path.split(path.sep).includes("..")) throw new Error("unsafe backup manifest path")
    const content = fs.readFileSync(path.join(root, entry.path))
    const digest = crypto.createHash("sha256").update(content).digest("hex")
    if (content.length !== entry.size || digest !== entry.sha256) throw new Error(`backup checksum mismatch: ${entry.path}`)
  }
  return manifest
}

function restoreBackup(root, destination) {
  const manifest = verifyBackup(root)
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw new Error("restore destination must be empty")
  fs.mkdirSync(destination, { recursive: true, mode: 0o750 })
  const started = Date.now()
  for (const layer of ["webui-config", "mimo-config", "mimo-data", "mimo-runtime-state", "mimo-state"]) {
    const source = path.join(root, layer)
    if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, layer), { recursive: true, dereference: false, preserveTimestamps: true })
  }
  const report = {
    schemaVersion: 1,
    backupID: manifest.id,
    restoredAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    fileCount: manifest.files.length,
  }
  fs.writeFileSync(path.join(destination, "restore-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o640 })
  return report
}

function writeStatus(value) {
  fs.mkdirSync(path.dirname(statusFile), { recursive: true, mode: 0o750 })
  const temporary = `${statusFile}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 })
  fs.renameSync(temporary, statusFile)
}

function filesUnder(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile()) files.push(file)
      else throw new Error(`unsupported backup entry: ${file}`)
    }
  }
  visit(root)
  return files.sort()
}

const startedAt = new Date().toISOString()
try {
  if (process.argv[2] === "verify") {
    const root = process.argv[3] ? path.resolve(process.argv[3]) : ""
    if (!root) throw new Error("usage: backup-state.mjs verify BACKUP_DIRECTORY")
    verifyBackup(root)
    console.log(`backup verified: ${root}`)
    process.exit(0)
  }
  if (process.argv[2] === "restore") {
    const root = process.argv[3] ? path.resolve(process.argv[3]) : ""
    const destination = process.argv[4] ? path.resolve(process.argv[4]) : ""
    if (!root || !destination) throw new Error("usage: backup-state.mjs restore BACKUP_DIRECTORY EMPTY_DESTINATION")
    const report = restoreBackup(root, destination)
    console.log(`backup restored: ${destination} (${report.durationMs}ms)`)
    process.exit(0)
  }
  const sqliteFiles = sources.flatMap(([, root]) => filesUnder(root))
    .filter((file) => /(?:\.db|\.sqlite|\.sqlite3)(?:-(?:wal|shm))?$/i.test(file))
  if (sqliteFiles.length && !offline) {
    throw new Error("SQLite state requires MIMO_BACKUP_OFFLINE=true after writers are stopped")
  }

  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o750 })
  const id = startedAt.replace(/[:.]/g, "-")
  staging = path.join(backupRoot, `.backup-${id}-${process.pid}`)
  const target = path.join(backupRoot, id)
  fs.mkdirSync(staging, { mode: 0o750 })
  const manifest = { schemaVersion: 1, id, createdAt: startedAt, method: offline ? "offline-filesystem" : "filesystem-non-sqlite", files: [] }
  for (const [layer, root] of sources) {
    if (!fs.existsSync(root)) continue
    const destination = path.join(staging, layer)
    fs.cpSync(root, destination, {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      filter: (source) => !path.relative(root, source).split(path.sep).includes("node_modules"),
    })
    for (const file of filesUnder(destination)) {
      const content = fs.readFileSync(file)
      manifest.files.push({ path: path.relative(staging, file), size: content.length, sha256: crypto.createHash("sha256").update(content).digest("hex") })
    }
  }
  fs.writeFileSync(path.join(staging, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o640 })
  verifyBackup(staging)
  fs.renameSync(staging, target)
  writeStatus({ state: "healthy", lastSuccessAt: startedAt, lastAttemptAt: startedAt, backup: target, fileCount: manifest.files.length })
  console.log(`backup complete: ${target}`)
} catch (error) {
  if (process.argv[2] !== "verify" && process.argv[2] !== "restore") {
    if (staging) fs.rmSync(staging, { recursive: true, force: true })
    let previous = {}
    try {
      const value = JSON.parse(fs.readFileSync(statusFile, "utf8"))
      if (typeof value.lastSuccessAt === "string") previous = { lastSuccessAt: value.lastSuccessAt, backup: value.backup, fileCount: value.fileCount }
    } catch {}
    writeStatus({ ...previous, state: "degraded", lastAttemptAt: startedAt, error: error instanceof Error ? error.message : String(error) })
  }
  throw error
}
