import net from "node:net"
import path from "node:path"
import { readBackupStatus } from "./backupStatus.js"
import { fileURLToPath } from "node:url"
import type { Request } from "express"
import { createApp } from "./app.js"
import { assertSafeAuthPolicy } from "./authPolicy.js"
import { createCliCommandRunner } from "./cliCommands.js"
import { addMimoModelConfig, getProjectRoot, listManualModels, migrateLegacyMimoConfig, readMimoConfig, resolveOpenAICompatibleModel } from "./config.js"
import { checkHealth, detectMimo, ensureMimoServerForDirectory, listBuiltinModels, listManagedMimoServers, probeNativeModel, runMimoPrompt, startMimoServer, stopManagedMimoServers, stopMimoServer } from "./mimo.js"
import { createMimoSupervisor } from "./mimoSupervisor.js"
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
const MIMO_REUSE_EXISTING = process.env.MIMO_REUSE_EXISTING === "true"
const AUTH_TOKEN = process.env.AUTH_TOKEN
const ALLOW_UNAUTHENTICATED_LAN = process.env.ALLOW_UNAUTHENTICATED_LAN === "true"
const MIMO_WORKSPACE_ROOT = path.resolve(process.env.MIMO_WORKSPACE_ROOT || getProjectRoot())
const MIMO_SERVE_CWD = path.resolve(process.env.MIMO_SERVE_CWD || MIMO_WORKSPACE_ROOT)
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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${baseUrl}/path`, { signal: controller.signal })
    clearTimeout(timeout)
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

  let shuttingDown = false
  let shutdownPromise: Promise<void> | null = null
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
    if (!MIMO_REUSE_EXISTING) return null
    const limit = MIMO_PORT_EXPLICITLY_SET ? 1 : scanRange
    for (let port = preferred; port < preferred + limit; port++) {
      const url = `http://${host}:${port}`
      try {
        const health = await checkHealth(url)
        if (health.healthy) {
          const pathInfo = await getMimoPathInfo(url)
          const directory = typeof pathInfo?.directory === "string" ? path.resolve(pathInfo.directory) : null
          if (directory === MIMO_SERVE_CWD) return port
          console.warn(`[server] refusing to reuse mimo serve on ${url}: directory identity mismatch`)
        }
      } catch {
        // port not reachable
      }
    }
    return null
  }

  async function startManagedBaseMimo(host: string, port: number, workspaceRoot: string) {
    if (shuttingDown) throw new Error("WebUI server is shutting down")
    const mimo = detectMimo()
    if (!mimo) {
      console.warn("[server] mimo CLI not found. WebUI will start but API calls will fail until mimo serve is available.")
      throw new Error("MiMo-Code CLI (mimo) not found")
    }

    console.log(`[server] starting mimo serve on ${host}:${port} with workspace root ${workspaceRoot} and cwd ${MIMO_SERVE_CWD}...`)
    const info = await startMimoServer(host, port, MIMO_SERVE_CWD)
    console.log(`[server] mimo serve ready at ${info.url} (pid ${info.pid})`)
    return info
  }

  const supervisor = createMimoSupervisor({
    host: MIMO_HOST,
    preferredPort: MIMO_PREFERRED_PORT,
    workspaceRoot: MIMO_WORKSPACE_ROOT,
    findExistingPort: () => findExistingMimoPort(MIMO_PREFERRED_PORT, MIMO_HOST),
    findAvailablePort: findAvailableMimoPort,
    startServer: startManagedBaseMimo,
    stopServer: stopMimoServer,
    stopManagedServers: stopManagedMimoServers,
    listManagedServers: listManagedMimoServers,
  })
  const mimo = detectMimo()
  const cliCommandRunner = mimo ? createCliCommandRunner({ command: mimo.command }) : null

  async function restartBaseMimo(delayMs = 3000) {
    if (shuttingDown) return
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(async () => {
      restartTimer = null
      if (shuttingDown) return
      console.warn("[server] base mimo serve appears unhealthy, restarting...")
      const result = await supervisor.restartBase("health_check_failed")
      if (!result.ok) console.warn(`[server] failed to restart base mimo serve: ${result.error}`)
    }, delayMs)
  }

  await supervisor.ensureBase()

  // Health monitor: if we manage the base mimo, restart it when it goes down
  const healthInterval = setInterval(async () => {
    const status = supervisor.status()
    if (!status.managed || shuttingDown) return
    const health = await checkHealth(status.base.url)
    if (!health.healthy) {
      await restartBaseMimo()
    }
  }, MIMO_HEALTH_INTERVAL_MS)

  const proxy = createRoutedMimoProxy(async (req) => {
    if (shuttingDown) throw new Error("WebUI server is shutting down")
    const directory = requestDirectory(req)
    if (!directory) return supervisor.status().base.url
    return (await ensureMimoServerForDirectory(MIMO_HOST, supervisor.status().base.port, directory, MIMO_WORKSPACE_ROOT)).url
  })

  const webDist = path.resolve(__dirname, "../../web/dist")
  const app = createApp({
    authToken: AUTH_TOKEN,
    host: HOST,
    port,
    workspaceRoot: MIMO_WORKSPACE_ROOT,
    mimoInfo: supervisor.status().base,
    isMimoManaged: () => supervisor.status().managed,
    getMimoSupervisorStatus: () => {
      const { base: _base, projectServers: _projectServers, ...status } = supervisor.status()
      return status
    },
    checkHealth,
    getMimoPathInfo,
    listManagedMimoServers: () => supervisor.status().projectServers,
    readMimoConfig,
    listManualModels,
    listBuiltinModels,
    addMimoModelConfig,
    probeNativeModel: (input) => probeNativeModel(input),
    restartMimo: async () => {
      console.log("[server] restarting base mimo serve via WebUI request")
      return supervisor.restartBase("operator_request")
    },
    runMimoPrompt,
    runReadonlyCliCommand: async (id) => {
      if (!cliCommandRunner) throw new Error("MiMo-Code CLI (mimo) not found")
      return cliCommandRunner.runReadonlyCliCommand(id)
    },
    resolveOpenAICompatibleModel,
    streamOpenAICompatible,
    proxy,
    webDist,
    getBackupStatus: () => readBackupStatus(
      process.env.MIMO_BACKUP_STATUS_FILE || "/var/lib/mimo-code-webui/backup-status.json",
      Number(process.env.MIMO_BACKUP_MAX_AGE_MS || 172800000),
    ),
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
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = (async () => {
    console.log("[server] shutting down...")
    shuttingDown = true
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    clearInterval(healthInterval)
    server.close()
    await supervisor.stopAll()
    process.exit(0)
    })()
    return shutdownPromise
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((error) => {
  console.error("[server] failed to start:", error)
  process.exit(1)
})
