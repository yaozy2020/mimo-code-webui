import type { MimoServerInfo } from "./mimo.js"
import { logEvent } from "./log.js"

interface SupervisorOptions {
  host: string
  preferredPort: number
  workspaceRoot: string
  findExistingPort: () => Promise<number | null>
  findAvailablePort: () => Promise<number>
  startServer: (host: string, port: number, workspaceRoot: string) => Promise<MimoServerInfo>
  stopServer: () => Promise<void>
  stopManagedServers: () => Promise<void>
  listManagedServers: () => unknown
}

export type MimoSupervisorState = "idle" | "starting" | "running" | "attached" | "restarting" | "degraded" | "stopping" | "exited"

export function createMimoSupervisor(options: SupervisorOptions) {
  let base: MimoServerInfo = { url: `http://${options.host}:${options.preferredPort}`, port: options.preferredPort, pid: 0 }
  let managed = false
  let state: MimoSupervisorState = "idle"
  let ensurePromise: Promise<MimoServerInfo> | null = null
  let restartPromise: Promise<{ ok: boolean; url?: string; error?: string }> | null = null
  let stopPromise: Promise<void> | null = null
  let restartCount = 0
  let consecutiveFailures = 0
  let lastRestartAt: string | null = null
  let lastRestartReason: string | null = null
  let lastHealthyAt: string | null = null
  let startupDurationMs: number | null = null

  function setBase(next: MimoServerInfo) {
    base.url = next.url
    base.port = next.port
    base.pid = next.pid
  }

  async function ensureBase() {
    if (state === "stopping" || state === "exited") throw new Error("MiMo supervisor is stopping")
    if (restartPromise) {
      await restartPromise
      return base
    }
    if (ensurePromise) return ensurePromise
    ensurePromise = ensureBaseInternal()
    try {
      return await ensurePromise
    } finally {
      ensurePromise = null
    }
  }

  async function ensureBaseInternal() {
    const startedAt = Date.now()
    state = "starting"
    const existingPort = await options.findExistingPort()
    if (existingPort !== null) {
      setBase({ url: `http://${options.host}:${existingPort}`, port: existingPort, pid: 0 })
      managed = false
      state = "attached"
      lastHealthyAt = new Date().toISOString()
      startupDurationMs = Date.now() - startedAt
      return base
    }
    const port = await options.findAvailablePort()
    try {
      setBase(await options.startServer(options.host, port, options.workspaceRoot))
      managed = true
      state = "running"
      consecutiveFailures = 0
      lastHealthyAt = new Date().toISOString()
      startupDurationMs = Date.now() - startedAt
    } catch (error) {
      consecutiveFailures += 1
      startupDurationMs = Date.now() - startedAt
      logEvent("warn", "mimo_start_failed", { error: error instanceof Error ? error.message : String(error), startupDurationMs })
      managed = false
      state = "degraded"
    }
    return base
  }

  async function restartBase(reason = "operator_request") {
    if (!managed) return { ok: false, error: "MiMo serve is not managed by this WebUI process. Please restart the WebUI service manually." }
    if (state === "stopping" || state === "exited") return { ok: false, error: "MiMo supervisor is stopping" }
    if (restartPromise) return restartPromise
    if (ensurePromise) await ensurePromise
    state = "restarting"
    restartCount += 1
    lastRestartAt = new Date().toISOString()
    lastRestartReason = reason
    const startedAt = Date.now()
    restartPromise = (async () => {
      try {
        await options.stopServer()
        const port = await options.findAvailablePort()
        setBase(await options.startServer(options.host, port, options.workspaceRoot))
        state = "running"
        consecutiveFailures = 0
        lastHealthyAt = new Date().toISOString()
        startupDurationMs = Date.now() - startedAt
        logEvent("info", "mimo_restart_succeeded", { reason, restartCount, startupDurationMs, port: base.port })
        return { ok: true, url: base.url }
      } catch (error) {
        consecutiveFailures += 1
        startupDurationMs = Date.now() - startedAt
        managed = false
        state = "degraded"
        logEvent("error", "mimo_restart_failed", { reason, restartCount, consecutiveFailures, startupDurationMs, error: error instanceof Error ? error.message : String(error) })
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    })()
    try { return await restartPromise } finally { restartPromise = null }
  }

  async function stopAll() {
    if (stopPromise) return stopPromise
    state = "stopping"
    stopPromise = (async () => {
      if (ensurePromise) await ensurePromise.catch(() => undefined)
      if (restartPromise) await restartPromise.catch(() => undefined)
      if (managed) await options.stopServer()
      await options.stopManagedServers()
      managed = false
      state = "exited"
    })()
    return stopPromise
  }

  return {
    ensureBase,
    restartBase,
    stopAll,
    status: () => ({
      base,
      managed,
      state,
      projectServers: options.listManagedServers(),
      restartCount,
      consecutiveFailures,
      lastRestartAt,
      lastRestartReason,
      lastHealthyAt,
      startupDurationMs,
    }),
  }
}
