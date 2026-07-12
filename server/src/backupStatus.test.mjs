import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readBackupStatus } from "./backupStatus.ts"

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-backup-status-"))
const file = path.join(dir, "status.json")
try {
  assert.equal(readBackupStatus(file, 1000).state, "unknown")
  assert.equal(readBackupStatus(file, Number.NaN).state, "degraded")
  fs.writeFileSync(file, JSON.stringify({ state: "healthy", lastSuccessAt: "2026-01-01T00:00:00.000Z" }))
  assert.equal(readBackupStatus(file, 1000, Date.parse("2026-01-01T00:00:00.500Z")).state, "healthy")
  assert.equal(readBackupStatus(file, 1000, Date.parse("2026-01-01T00:00:02.000Z")).state, "degraded")
  assert.equal(readBackupStatus(file, 1000, Date.parse("2025-12-31T23:59:59.000Z")).state, "degraded")
  fs.writeFileSync(file, JSON.stringify({ state: "degraded", error: "secret path" }))
  const failed = readBackupStatus(file, 1000)
  assert.equal(failed.state, "degraded")
  assert.equal(JSON.stringify(failed).includes("secret path"), false)
  console.log("backup status tests passed")
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
