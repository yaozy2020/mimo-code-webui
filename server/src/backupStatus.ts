import fs from "node:fs"

export type BackupStatus = {
  state: "healthy" | "degraded" | "unknown"
  lastSuccessAt?: string
  lastAttemptAt?: string
  ageMs?: number
  reason?: string
}

export function readBackupStatus(file: string, maxAgeMs: number, now = Date.now()): BackupStatus {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return { state: "degraded", reason: "invalid backup RPO configuration" }
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
    const lastSuccessAt = typeof value.lastSuccessAt === "string" ? value.lastSuccessAt : undefined
    const lastAttemptAt = typeof value.lastAttemptAt === "string" ? value.lastAttemptAt : undefined
    const ageMs = lastSuccessAt ? now - Date.parse(lastSuccessAt) : undefined
    if (value.state !== "healthy") return { state: "degraded", lastSuccessAt, lastAttemptAt, ageMs, reason: "last backup attempt failed" }
    if (ageMs === undefined || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
      return { state: "degraded", lastSuccessAt, lastAttemptAt, ageMs, reason: "backup is older than the configured RPO" }
    }
    return { state: "healthy", lastSuccessAt, lastAttemptAt, ageMs }
  } catch {
    return { state: "unknown", reason: "no readable backup status" }
  }
}
