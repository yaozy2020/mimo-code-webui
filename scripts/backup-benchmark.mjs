import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const totalBytes = Number(process.env.BACKUP_BENCHMARK_BYTES || 1024 ** 3)
const fileBytes = Number(process.env.BACKUP_BENCHMARK_FILE_BYTES || 16 * 1024 ** 2)
if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || !Number.isSafeInteger(fileBytes) || fileBytes <= 0) {
  throw new Error("BACKUP_BENCHMARK_BYTES and BACKUP_BENCHMARK_FILE_BYTES must be positive integers")
}

const root = fs.mkdtempSync(path.join(process.env.BACKUP_BENCHMARK_ROOT || os.tmpdir(), "mimo-backup-benchmark-"))
const source = path.join(root, "source")
const backups = path.join(root, "backups")
const restore = path.join(root, "restore")
const status = path.join(root, "backup-status.json")
const chunk = Buffer.alloc(Math.min(fileBytes, 1024 * 1024), 0x5a)

function directoryBytes(directory) {
  if (!fs.existsSync(directory)) return 0
  let total = 0
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total += directoryBytes(target)
    else if (entry.isFile()) total += fs.statSync(target).size
  }
  return total
}

function run(label, args, env) {
  const started = process.hrtime.bigint()
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, env, encoding: "utf8" })
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr}`)
  return { durationMs, stdout: result.stdout.trim() }
}

try {
  fs.mkdirSync(source)
  let remaining = totalBytes
  let index = 0
  while (remaining > 0) {
    const size = Math.min(fileBytes, remaining)
    const file = fs.openSync(path.join(source, `state-${String(index).padStart(5, "0")}.bin`), "w")
    try {
      let written = 0
      while (written < size) {
        const length = Math.min(chunk.length, size - written)
        fs.writeSync(file, chunk, 0, length)
        written += length
      }
    } finally {
      fs.closeSync(file)
    }
    remaining -= size
    index += 1
  }

  const env = {
    ...process.env,
    MIMO_BACKUP_OFFLINE: "true",
    MIMO_BACKUP_ROOT: backups,
    MIMO_BACKUP_STATUS_FILE: status,
    MIMO_WEBUI_CONFIG_DIR: path.join(root, "missing-webui"),
    MIMO_CONFIG_DIR: path.join(root, "missing-config"),
    MIMO_DATA_DIR: path.join(root, "missing-data"),
    MIMO_RUNTIME_STATE_DIR: path.join(root, "missing-runtime"),
    MIMO_STATE_DIR: source,
  }
  const backup = run("backup", ["scripts/backup-state.mjs"], env)
  const backupPath = JSON.parse(fs.readFileSync(status, "utf8")).backup
  const verify = run("verify", ["scripts/backup-state.mjs", "verify", backupPath], env)
  const restored = run("restore", ["scripts/backup-state.mjs", "restore", backupPath, restore], env)
  const backupBytes = directoryBytes(backupPath)
  const report = {
    sourceBytes: totalBytes,
    fileBytes,
    fileCount: index,
    backupBytes,
    diskAmplification: Number((backupBytes / totalBytes).toFixed(3)),
    backupDurationMs: Math.round(backup.durationMs),
    verifyDurationMs: Math.round(verify.durationMs),
    restoreDurationMs: Math.round(restored.durationMs),
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (process.env.BACKUP_BENCHMARK_KEEP !== "true") fs.rmSync(root, { recursive: true, force: true })
  else console.error(`benchmark data retained at ${root}`)
}
