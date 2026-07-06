import type { Request, Response } from "express"
import type { Socket } from "node:net"
import { createProxyMiddleware } from "http-proxy-middleware"

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
        console.log(`[proxy] ${req.method} ${req.path} -> ${targetUrl}${proxyReq.path}`)
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
