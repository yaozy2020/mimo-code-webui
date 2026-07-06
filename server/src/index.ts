import cors from "cors"
import express, { type Request, type Response, type NextFunction } from "express"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { addMimoModelConfig, getProjectRoot, listManualModels, readMimoConfig } from "./config.js"
import { checkHealth, detectMimo, listBuiltinModels, probeNativeModel, runMimoPrompt, startMimoServer, stopMimoServer } from "./mimo.js"
import { createMimoProxy } from "./proxy.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PREFERRED_PORT = Number(process.env.PORT) || 8080
const PORT_EXPLICITLY_SET = process.env.PORT !== undefined
const HOST = process.env.HOST || "0.0.0.0"
const MIMO_PORT = Number(process.env.MIMO_PORT) || 4096
const MIMO_HOST = process.env.MIMO_HOST || "127.0.0.1"
const AUTH_TOKEN = process.env.AUTH_TOKEN
const MIMO_WORKSPACE_ROOT = path.resolve(process.env.MIMO_WORKSPACE_ROOT || getProjectRoot())

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

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_TOKEN) return next()

  const auth = req.headers.authorization
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized", authRequired: true })
  }

  const token = auth.slice(7)
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Invalid token", authRequired: true })
  }

  next()
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

async function main() {
  const app = express()
  app.use(cors())
  // Only parse JSON for non-/api routes; /api is proxied to mimo serve and needs the raw body
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next()
    express.json()(req, res, next)
  })

  const port = await findAvailablePort(PREFERRED_PORT, HOST, PORT_EXPLICITLY_SET)

  let mimoInfo = { url: `http://${MIMO_HOST}:${MIMO_PORT}`, port: MIMO_PORT, pid: 0 }
  let mimoStartedByUs = false

  // Try to detect existing mimo serve, otherwise start one
  const existingHealth = await checkHealth(mimoInfo.url)
  if (existingHealth.healthy) {
    console.log(`[server] using existing mimo serve at ${mimoInfo.url}`)
  } else {
    const mimo = detectMimo()
    if (!mimo) {
      console.warn("[server] mimo CLI not found. WebUI will start but API calls will fail until mimo serve is available.")
    } else {
      console.log(`[server] starting mimo serve on ${MIMO_HOST}:${MIMO_PORT} with workspace root ${MIMO_WORKSPACE_ROOT}...`)
      mimoInfo = await startMimoServer(MIMO_HOST, MIMO_PORT, MIMO_WORKSPACE_ROOT)
      mimoStartedByUs = true
      console.log(`[server] mimo serve ready at ${mimoInfo.url} (pid ${mimoInfo.pid})`)
    }
  }

  const proxy = createMimoProxy(mimoInfo.url)

  // Public status endpoint (no auth) so frontend can detect if auth is required
  app.get("/status", async (req, res) => {
    const health = await checkHealth(mimoInfo.url)
    const pathInfo = health.healthy ? await getMimoPathInfo(mimoInfo.url) : null
    const hostHeader = req.headers.host || `${HOST}:${port}`
    res.json({
      webui: { port, host: HOST, url: `http://${hostHeader}` },
      mimo: {
        ...mimoInfo,
        healthy: health.healthy,
        version: health.version,
        managed: mimoStartedByUs,
        workspaceRoot: MIMO_WORKSPACE_ROOT,
        path: pathInfo,
      },
      config: readMimoConfig(),
      authRequired: !!AUTH_TOKEN,
    })
  })

  app.use("/local-config", authMiddleware)
  app.get("/local-config/models", (_req, res) => {
    res.json({ models: listManualModels() })
  })
  app.get("/local-config/model-templates", async (_req, res) => {
    res.json({ models: await listBuiltinModels() })
  })
  app.post("/local-config/models", (req, res) => {
    try {
      const model = addMimoModelConfig(req.body as Parameters<typeof addMimoModelConfig>[0])
      res.json({ model })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })
  app.post("/local-config/native-model-probe", async (req, res) => {
    try {
      const { model } = req.body as { model?: string }
      if (!model) {
        res.status(400).json({ error: "model is required" })
        return
      }
      res.json(await probeNativeModel({ baseUrl: mimoInfo.url, model }))
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })
  app.post("/local-run", async (req, res) => {
    try {
      const { model, prompt } = req.body as { model?: string; prompt?: string }
      if (!model || !prompt) {
        res.status(400).json({ error: "model and prompt are required" })
        return
      }
      res.json(await runMimoPrompt({ model, prompt }))
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  // Static files in production (publicly accessible so the login page can load)
  const webDist = path.resolve(__dirname, "../../web/dist")
  const hasWebDist = fs.existsSync(webDist)
  if (hasWebDist) {
    app.use(express.static(webDist))
  }

  // Protected API routes
  app.use("/api", authMiddleware)
  app.use("/api", proxy)

  // SPA catch-all (public)
  if (hasWebDist) {
    app.get("*", (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"))
    })
  } else {
    app.get("/", (_req, res) => {
      res.send("MiMo Code WebUI server is running. Frontend build not found.")
    })
  }

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
    server.close()
    if (mimoStartedByUs) {
      await stopMimoServer()
    }
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((error) => {
  console.error("[server] failed to start:", error)
  process.exit(1)
})
