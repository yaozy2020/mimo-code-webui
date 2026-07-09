import cors from "cors"
import crypto from "node:crypto"
import express, { type NextFunction, type Request, type Response } from "express"
import fs from "node:fs"
import path from "node:path"
import type { ManualModelInput } from "./config.js"
import type { OpenAIStreamHandlers, OpenAIStreamInput, OpenAIStreamModel } from "./openaiStream.js"
import { createPublicConfigSummary } from "./status.js"

type MimoInfo = { url: string; port: number; pid: number }
type HandlerResult<T> = T | Promise<T>

export interface AppOptions {
  authToken?: string
  host: string
  port: number
  workspaceRoot: string
  mimoInfo: MimoInfo
  isMimoManaged: () => boolean
  checkHealth: (baseUrl: string) => Promise<{ healthy: boolean; version?: string }>
  getMimoPathInfo: (baseUrl: string) => Promise<Record<string, unknown> | null>
  listManagedMimoServers: () => unknown
  readMimoConfig: () => unknown
  listManualModels: () => unknown
  listBuiltinModels: () => HandlerResult<unknown>
  addMimoModelConfig: (input: ManualModelInput) => unknown
  probeNativeModel: (input: { baseUrl: string; model: string }) => HandlerResult<unknown>
  restartMimo: () => Promise<{ ok: boolean; url?: string; error?: string }>
  runMimoPrompt: (input: { model: string; prompt: string }) => HandlerResult<unknown>
  resolveOpenAICompatibleModel: (model: string) => OpenAIStreamModel
  streamOpenAICompatible: (input: OpenAIStreamInput, handlers: OpenAIStreamHandlers) => Promise<void>
  proxy?: express.RequestHandler
  webDist?: string
}

function createAuthMiddleware(authToken?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!authToken) return next()

    const auth = req.headers.authorization
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized", authRequired: true })
    }

    const token = auth.slice(7)
    if (token.length !== authToken.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(authToken))) {
      return res.status(401).json({ error: "Invalid token", authRequired: true })
    }

    next()
  }
}

export function createApp(options: AppOptions) {
  const app = express()
  const authMiddleware = createAuthMiddleware(options.authToken)

  app.use(cors({ origin: false }))
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next()
    express.json()(req, res, next)
  })

  app.get("/status", async (req, res) => {
    const health = await options.checkHealth(options.mimoInfo.url)
    const pathInfo = health.healthy ? await options.getMimoPathInfo(options.mimoInfo.url) : null
    const hostHeader = req.headers.host || `${options.host}:${options.port}`
    res.json({
      webui: { port: options.port, host: options.host, url: `http://${hostHeader}` },
      mimo: {
        ...options.mimoInfo,
        healthy: health.healthy,
        version: health.version,
        managed: options.isMimoManaged(),
        workspaceRoot: options.workspaceRoot,
        projectServers: options.listManagedMimoServers(),
        path: pathInfo,
      },
      config: createPublicConfigSummary(options.readMimoConfig()),
      authRequired: !!options.authToken,
    })
  })

  app.use("/local-config", authMiddleware)
  app.use("/local-run", authMiddleware)
  app.get("/local-config/models", (_req, res) => {
    res.json({ models: options.listManualModels() })
  })
  app.get("/local-config/model-templates", async (_req, res) => {
    res.json({ models: await options.listBuiltinModels() })
  })
  app.post("/local-config/models", (req, res) => {
    try {
      const model = options.addMimoModelConfig(req.body as ManualModelInput)
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
      res.json(await options.probeNativeModel({ baseUrl: options.mimoInfo.url, model }))
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })
  app.post("/local-config/restart-mimo", async (_req, res) => {
    try {
      const result = await options.restartMimo()
      if (!result.ok) {
        res.status(500).json({ error: result.error ?? "Failed to restart mimo serve" })
        return
      }
      res.json({ ok: true, url: result.url })
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
      res.json(await options.runMimoPrompt({ model, prompt }))
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })
  app.post("/local-run/stream", async (req, res) => {
    const { model, prompt } = req.body as { model?: string; prompt?: string }
    if (!model || !prompt) {
      res.status(400).json({ error: "model and prompt are required" })
      return
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    })

    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`)
    const abort = new AbortController()
    req.on("aborted", () => abort.abort())

    try {
      const config = options.resolveOpenAICompatibleModel(model)
      await options.streamOpenAICompatible(
        { model: config, prompt, signal: abort.signal },
        {
          onStart: () => send({ type: "start" }),
          onDelta: (text) => send({ type: "delta", text }),
          onError: (message) => send({ type: "error", error: message }),
          onDone: () => send({ type: "done" }),
        },
      )
    } catch (error) {
      if (!abort.signal.aborted) send({ type: "error", error: error instanceof Error ? error.message : String(error) })
    } finally {
      res.end()
    }
  })

  const hasWebDist = !!options.webDist && fs.existsSync(options.webDist)
  if (hasWebDist && options.webDist) {
    app.use(express.static(options.webDist))
  }

  if (options.proxy) {
    app.use("/api", authMiddleware)
    app.use("/api", options.proxy)
  }

  if (hasWebDist && options.webDist) {
    app.get("*", (_req, res) => {
      res.sendFile(path.join(options.webDist!, "index.html"))
    })
  } else {
    app.get("/", (_req, res) => {
      res.send("MiMo Code WebUI server is running. Frontend build not found.")
    })
  }

  return app
}
