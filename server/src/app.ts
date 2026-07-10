import cors from "cors"
import crypto from "node:crypto"
import express, { type NextFunction, type Request, type Response } from "express"
import fs from "node:fs"
import path from "node:path"
import type { ManualModelInput } from "./config.js"
import type { OpenAIStreamHandlers, OpenAIStreamInput, OpenAIStreamModel } from "./openaiStream.js"
import { createPublicConfigSummary } from "./status.js"
import { validateWorkspaceDirectory } from "./workspacePolicy.js"

type MimoInfo = { url: string; port: number; pid: number }
type HandlerResult<T> = T | Promise<T>
const MAX_LOCAL_PROMPT_LENGTH = 50000
const JSON_BODY_LIMIT = "256kb"
const DEFAULT_RATE_LIMIT = { windowMs: 60_000, max: 120 }
const AUTH_COOKIE_NAME = "mimo_webui_auth"

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
  runReadonlyCliCommand: (id: string) => HandlerResult<unknown>
  resolveOpenAICompatibleModel: (model: string) => OpenAIStreamModel
  streamOpenAICompatible: (input: OpenAIStreamInput, handlers: OpenAIStreamHandlers) => Promise<void>
  proxy?: express.RequestHandler
  webDist?: string
  rateLimit?: { windowMs: number; max: number }
}

function publicError(message: string) {
  return { error: message }
}

function logRouteError(context: string, error: unknown, req?: Request) {
  const requestID = req?.headers["x-request-id"]
  const prefix = typeof requestID === "string" ? `[app] [${requestID}]` : "[app]"
  console.error(`${prefix} ${context}:`, error instanceof Error ? error.message : error)
}

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>()
  if (!header) return cookies
  for (const item of header.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=")
    if (!rawName) continue
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")))
  }
  return cookies
}

function authCookie(token: string, maxAge: number) {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

function tokensEqual(token: string, expectedHash: Buffer | null) {
  if (!expectedHash) return false
  const tokenHash = crypto.createHash("sha256").update(token).digest()
  return crypto.timingSafeEqual(tokenHash, expectedHash)
}

function createRateLimitMiddleware(input?: { windowMs: number; max: number }) {
  const { windowMs, max } = input ?? DEFAULT_RATE_LIMIT
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    const key = `${req.ip}:${req.method}:${req.path}`
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    current.count += 1
    if (current.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)))
      res.status(429).json(publicError("Too many requests"))
      return
    }

    next()
  }
}

function handleJsonParseError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    res.status(413).json(publicError("request body is too large"))
    return
  }
  next(error)
}

function createAuthMiddleware(authToken?: string) {
  const expectedHash = authToken ? crypto.createHash("sha256").update(authToken).digest() : null
  return (req: Request, res: Response, next: NextFunction) => {
    if (!authToken) return next()

    const auth = req.headers.authorization
    const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined
    const cookieToken = parseCookies(req.headers.cookie).get(AUTH_COOKIE_NAME)
    const token = bearerToken || cookieToken
    if (!token) {
      return res.status(401).json({ error: "Unauthorized", authRequired: true })
    }

    if (!tokensEqual(token, expectedHash)) {
      return res.status(401).json({ error: "Invalid token", authRequired: true })
    }

    next()
  }
}

export function createApp(options: AppOptions) {
  const app = express()
  const authMiddleware = createAuthMiddleware(options.authToken)
  const rateLimitMiddleware = createRateLimitMiddleware(options.rateLimit)

  app.use(cors({ origin: false }))
  app.use((req, res, next) => {
    const requestID = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].trim()
      ? req.headers["x-request-id"].trim()
      : crypto.randomUUID()
    req.headers["x-request-id"] = requestID
    res.setHeader("X-Request-ID", requestID)
    next()
  })
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next()
    express.json({ limit: JSON_BODY_LIMIT })(req, res, next)
  })
  app.use(handleJsonParseError)

  const createDetailedStatus = async (req: Request) => {
    const health = await options.checkHealth(options.mimoInfo.url)
    const pathInfo = health.healthy ? await options.getMimoPathInfo(options.mimoInfo.url) : null
    const hostHeader = req.headers.host || `${options.host}:${options.port}`
    return {
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
    }
  }

  app.get("/status", async (_req, res) => {
    const health = await options.checkHealth(options.mimoInfo.url)
    res.json({
      webui: { port: options.port, host: options.host },
      mimo: { healthy: health.healthy, version: health.version },
      authRequired: !!options.authToken,
    })
  })

  app.post("/login", (req, res) => {
    if (!options.authToken) {
      res.status(204).end()
      return
    }
    const expectedHash = crypto.createHash("sha256").update(options.authToken).digest()
    const { token } = req.body as { token?: string }
    if (!token || !tokensEqual(token, expectedHash)) {
      res.status(401).json({ error: "Invalid token", authRequired: true })
      return
    }
    res.setHeader("Set-Cookie", authCookie(token, 60 * 60 * 24 * 30))
    res.status(204).end()
  })

  app.post("/logout", (_req, res) => {
    res.setHeader("Set-Cookie", authCookie("", 0))
    res.status(204).end()
  })

  app.get("/local-status", authMiddleware, async (req, res) => {
    res.json(await createDetailedStatus(req))
  })

  app.use("/local-config", authMiddleware)
  app.use("/local-run", authMiddleware)
  app.use("/local-cli", authMiddleware)
  app.use("/local-status", rateLimitMiddleware)
  app.use("/local-config", rateLimitMiddleware)
  app.use("/local-run", rateLimitMiddleware)
  app.use("/local-cli", rateLimitMiddleware)
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
      logRouteError("failed to save model config", error, req)
      res.status(400).json(publicError("Invalid model configuration"))
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
      logRouteError("failed to probe native model", error, req)
      res.status(500).json(publicError("Failed to probe native model"))
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
      logRouteError("failed to restart mimo serve", error, _req)
      res.status(500).json(publicError("Failed to restart mimo serve"))
    }
  })
  app.post("/local-run", async (req, res) => {
    try {
      const { model, prompt } = req.body as { model?: string; prompt?: string }
      if (!model || !prompt) {
        res.status(400).json({ error: "model and prompt are required" })
        return
      }
      if (prompt.length > MAX_LOCAL_PROMPT_LENGTH) {
        res.status(413).json({ error: "prompt is too large" })
        return
      }
      res.json(await options.runMimoPrompt({ model, prompt }))
    } catch (error) {
      logRouteError("local run failed", error, req)
      res.status(500).json(publicError("Local run failed"))
    }
  })
  app.post("/local-run/stream", async (req, res) => {
    const { model, prompt } = req.body as { model?: string; prompt?: string }
    if (!model || !prompt) {
      res.status(400).json({ error: "model and prompt are required" })
      return
    }
    if (prompt.length > MAX_LOCAL_PROMPT_LENGTH) {
      res.status(413).json({ error: "prompt is too large" })
      return
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    })

    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`)
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 120000)
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
      if (!abort.signal.aborted) {
        logRouteError("local stream failed", error, req)
        send({ type: "error", error: "Local stream failed" })
      }
    } finally {
      clearTimeout(timeout)
      res.end()
    }
  })

  app.get("/local-cli/commands/:id", async (req, res) => {
    try {
      res.json(await options.runReadonlyCliCommand(req.params.id))
    } catch (error) {
      logRouteError("local cli command failed", error, req)
      res.status(400).json(publicError("Unsupported or failed MiMo command"))
    }
  })

  const hasWebDist = !!options.webDist && fs.existsSync(options.webDist)
  if (hasWebDist && options.webDist) {
    app.use(express.static(options.webDist))
  }

  if (options.proxy) {
    app.use("/api", authMiddleware)
    app.use("/api", rateLimitMiddleware)
    app.use("/api", (req, res, next) => {
      const directory = req.query.directory
      if (typeof directory !== "string" || !directory.trim()) return next()
      try {
        validateWorkspaceDirectory(directory.trim(), options.workspaceRoot)
        next()
      } catch (error) {
        logRouteError("invalid workspace directory", error, req)
        res.status(400).json(publicError("Invalid workspace directory"))
      }
    })
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
