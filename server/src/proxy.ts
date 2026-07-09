import type { NextFunction, Request, Response } from "express"
import type { Socket } from "node:net"
import { createProxyMiddleware } from "http-proxy-middleware"

const MAX_ROUTED_PROXIES = 32

export function createMimoProxy(targetUrl: string) {
  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    ws: true,
    // Don't rewrite path - we proxy /api/* to /* on the target
    pathRewrite: (path) => path.replace(/^\/api/, ""),
    // Ensure SSE responses are not buffered
    selfHandleResponse: false,
    on: {
      proxyReq: (proxyReq, req: Request) => {
        console.log(`[proxy] ${req.method} ${req.path} -> ${targetUrl}`)
      },
      error: (err, req: Request, res: Response | Socket) => {
        console.error(`[proxy] error on ${req.method} ${req.path}:`, err.message)
        if (!(res as Response).headersSent && "status" in res) {
          ;(res as Response).status(502).json({ error: "Failed to proxy request to mimo serve" })
        }
      },
    },
  })
}

export function createRoutedMimoProxy(resolveTargetUrl: (req: Request) => Promise<string>) {
  const proxies = new Map<string, ReturnType<typeof createMimoProxy>>()

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUrl = await resolveTargetUrl(req)
      let proxy = proxies.get(targetUrl)
      if (!proxy) {
        if (proxies.size >= MAX_ROUTED_PROXIES) {
          const oldest = proxies.keys().next().value as string | undefined
          if (oldest) proxies.delete(oldest)
        }
        proxy = createMimoProxy(targetUrl)
        proxies.set(targetUrl, proxy)
      }
      proxy(req, res, next)
    } catch (error) {
      console.error(`[proxy] failed to resolve target for ${req.method} ${req.path}:`, error)
      if (!res.headersSent) {
        res.status(502).json({ error: error instanceof Error ? error.message : "Failed to resolve mimo serve target" })
      }
    }
  }
}
