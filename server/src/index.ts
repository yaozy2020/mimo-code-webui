import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Request } from "express"
import { createApp } from "./app.js"
import { assertSafeAuthPolicy } from "./authPolicy.js"
import { addMimoModelConfig, getProjectRoot, listManualModels, migrateLegacyMimoConfig, readMimoConfig, resolveOpenAICompatibleModel } from "./config.js"
import { checkHealth, detectMimo, ensureMimoServerForDirectory, listBuiltinModels, listManagedMimoServers, probeNativeModel, runMimoPrompt, startMimoServer, stopManagedMimoServers, stopMimoServer } from "./mimo.js"
import { streamOpenAICompatible } from "./openaiStream.js"
import { createRoutedMimoProxy } from "./proxy.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PREFERRED_PORT = Number(process.env.PORT) || 8080
const PORT_EXPLICITLY_SET = process.env.PORT !== undefined
const HOST = process.env.HOST || "127.0.0.1"
const MIMO_HOST = process.env.MIMO_HOST || "127.0.0.1"
const MIMO_PREFERRED_PORT = Number(process.env.MIMO_PORT) || 4096
const MIMO_PORT_EXPLICITLY_SET = process.env.MIMO_PORT !== undefined
const AUTH_TOKEN = process.env.AUTH_TOKEN
const ALLOW_UNAUTHENTICATED_LAN = process.env.ALLOW_UNAUTHENTICATED_LAN === "true"
const MIMO_WORKSPACE_ROOT = path.resolve(process.env.MIMO_WORKSPACE_ROOT || getProjectRoot())
const MIMO_HEALTH_INTERVAL_MS = Number(process.env.MIMO_HEALTH_INTERVAL_MS) || 10000

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.close(() => resolve(true))
      })
      .listen(port, host)
  })
}

async function findAvailablePort(preferred: number, host: string, explicit: boolean): Promise<number> {
  if (explicit) {
    if (await isPortAvailable(preferred, host)) return preferred
    throw new Error(`Port ${preferred} is already in use. Set a different port with PORT=<port>`)
  }

  const maxAttempts = 100
  let port = preferred
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isPortAvailable(port, host)) return port
    console.log(`[server] port ${port} is in use, trying ${port + 1}...`)
    port++
  }
  throw new Error(`Could not find an available port between ${preferred} and ${preferred + maxAttempts - 1}`)
}

async function getMimoPathInfo(baseUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${baseUrl}/path`)
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function requestDirectory(req: Request): string | undefined {
  const value = req.query.directory
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

async function main() {
  migrateLegacyMimoConfig()
  assertSafeAuthPolicy({ host: HOST, authToken: AUTH_TOKEN, allowUnauthenticatedLan: ALLOW_UNAUTHENTICATED_LAN })
  const port = await findAvailablePort(PREFERRED_PORT, HOST, PORT_EXPLICITLY_SET)

  // Base MiMo serve state. We keep this as a mutable object so proxies/status can see updates after a restart.
  const mimoInfo: { url: string; port: number; pid: number } = {
    url: `http://${MIMO_HOST}:${MIMO_PREFERRED_PORT}`,
    port: MIMO_PREFERRED_PORT,
    pid: 0,
  }
  let mimoStartedByUs = false
  let shuttingDown = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  async function findAvailableMimoPort(): Promise<number> {
    if (MIMO_PORT_EXPLICITLY_SET) {
      if (await isPortAvailable(MIMO_PREFERRED_PORT, MIMO_HOST)) return MIMO_PREFERRED_PORT
      throw new Error(
        `Requested MIMO_PORT ${MIMO_PREFERRED_PORT} is already in use. Set a different port or unset MIMO_PORT to auto-scan.`,
      )
    }
    const maxAttempts = 100
    let port = MIMO_PREFERRED_PORT
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (await isPortAvailable(port, MIMO_HOST)) return port
      console.log(`[server] mimo port ${port} is in use, trying ${port + 1}...`)
      port++
    }
    throw new Error(`Could not find an available mimo port between ${MIMO_PREFERRED_PORT} and ${MIMO_PREFERRED_PORT + maxAttempts - 1}`)
  }

  async function findExistingMimoPort(preferred: number, host: string, scanRange = 20): Promise<number | null> {
    for (let port = preferred; port < preferred + scanRange; port++) {
      const url = `http://${host}:${port}`
      try {
        const health = await checkHealth(url)
        if (health.healthy) {
          return port
        }
      } catch {
        // port not reachable
      }
    }
    return null
  }

  async function startManagedBaseMimo(): Promise<boolean> {
    if (shuttingDown) return false
    const mimo = detectMimo()
    if (!mimo) {
      console.warn("[server] mimo CLI not found. WebUI will start but API calls will fail until mimo serve is available.")
      return false
    }

    try {
      const port = await findAvailableMimoPort()
      mimoInfo.url = `http://${MIMO_HOST}:${port}`
      mimoInfo.port = port
      console.log(`[server] starting mimo serve on ${MIMO_HOST}:${port} with workspace root ${MIMO_WORKSPACE_ROOT}...`)
      const info = await startMimoServer(MIMO_HOST, port, MIMO_WORKSPACE_ROOT)
      mimoInfo.url = info.url
      mimoInfo.port = info.port
      mimoInfo.pid = info.pid
      mimoStartedByUs = true
      console.log(`[server] mimo serve ready at ${mimoInfo.url} (pid ${mimoInfo.pid})`)
      return true
    } catch (error) {
      console.error("[server] failed to start mimo serve:", error)
      return false
    }
  }

  async function restartBaseMimo(delayMs = 3000) {
    if (shuttingDown) return
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(async () => {
      restartTimer = null
      if (shuttingDown) return
      console.warn("[server] base mimo serve appears unhealthy, restarting...")
      try {
        await stopMimoServer()
      } catch (error) {
        console.warn("[server] error stopping old mimo serve:", error)
      }
      await startManagedBaseMimo()
    }, delayMs)
  }

  // Try to detect an existing mimo serve on nearby ports first. This avoids
  // spawning a second instance when the user already runs `mimo serve`.
  const existingPort = await findExistingMimoPort(MIMO_PREFERRED_PORT, MIMO_HOST)
  if (existingPort !== null) {
    mimoInfo.url = `http://${MIMO_HOST}:${existingPort}`
    mimoInfo.port = existingPort
    console.log(`[server] using existing mimo serve at ${mimoInfo.url}`)
  } else {
    await startManagedBaseMimo()
  }

  // Health monitor: if we manage the base mimo, restart it when it goes down
  const healthInterval = setInterval(async () => {
    if (!mimoStartedByUs || shuttingDown) return
    const health = await checkHealth(mimoInfo.url)
    if (!health.healthy) {
      await restartBaseMimo()
    }
  }, MIMO_HEALTH_INTERVAL_MS)

  const proxy = createRoutedMimoProxy(async () => mimoInfo.url)

  const webDist = path.resolve(__dirname, "../../web/dist")
  const app = createApp({
    authToken: AUTH_TOKEN,
    host: HOST,
    port,
    workspaceRoot: MIMO_WORKSPACE_ROOT,
    mimoInfo,
    isMimoManaged: () => mimoStartedByUs,
    checkHealth,
    getMimoPathInfo,
    listManagedMimoServers,
    readMimoConfig,
    listManualModels,
    listBuiltinModels,
    addMimoModelConfig,
    probeNativeModel: (input) => probeNativeModel(input),
    restartMimo: async () => {
      if (!mimoStartedByUs) {
        return { ok: false, error: "MiMo serve is not managed by this WebUI process. Please restart the WebUI service manually." }
      }
      console.log("[server] restarting base mimo serve via WebUI request")
      await stopMimoServer()
      const ok = await startManagedBaseMimo()
      return ok ? { ok: true, url: mimoInfo.url } : { ok: false, error: "Failed to restart mimo serve" }
    },
    runMimoPrompt,
    resolveOpenAICompatibleModel,
    streamOpenAICompatible,
    proxy,
    webDist,
  })

  console.log(`[server] starting Express on ${HOST}:${port}`)
  const server = app.listen(port, HOST, () => {
    console.log(`[server] MiMo Code WebUI backend listening on http://${HOST}:${port}`)
    if (AUTH_TOKEN) {
      console.log("[server] authentication enabled with AUTH_TOKEN")
    }
  })

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[server] shutting down...")
    shuttingDown = true
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    clearInterval(healthInterval)
    server.close()
    if (mimoStartedByUs) {
      await stopMimoServer()
    }
    await stopManagedMimoServers()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((error) => {
  console.error("[server] failed to start:", error)
  process.exit(1)
})
