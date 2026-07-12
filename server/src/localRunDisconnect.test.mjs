import assert from "node:assert/strict"
import http from "node:http"
import { createApp } from "./app.ts"

let upstreamAborted = false
const app = createApp({
  host: "127.0.0.1",
  port: 0,
  workspaceRoot: "/tmp",
  mimoInfo: { url: "http://127.0.0.1:4096", port: 4096, pid: 0 },
  isMimoManaged: () => false,
  checkHealth: async () => ({ healthy: true }),
  getMimoPathInfo: async () => null,
  listManagedMimoServers: () => [],
  readMimoConfig: () => ({}),
  listManualModels: () => [],
  listBuiltinModels: () => [],
  addMimoModelConfig: () => ({}),
  probeNativeModel: () => ({ supported: true }),
  restartMimo: async () => ({ ok: true }),
  runMimoPrompt: async () => ({ text: "ok" }),
  runReadonlyCliCommand: async () => ({}),
  resolveOpenAICompatibleModel: () => ({ providerID: "test", modelID: "model", baseUrl: "https://example.invalid/v1" }),
  streamOpenAICompatible: async ({ signal }, handlers) => {
    handlers.onStart?.()
    handlers.onDelta?.("started")
    await new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        upstreamAborted = true
        resolve()
      }, { once: true })
    })
  },
})

const server = http.createServer(app)
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
try {
  const address = server.address()
  const response = await fetch(`http://127.0.0.1:${address.port}/local-run/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "test/model", prompt: "hello" }),
  })
  const reader = response.body.getReader()
  await reader.read()
  await reader.cancel()
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(upstreamAborted, true, "closing the SSE response should abort the upstream provider request")
  console.log("local-run disconnect cancellation test passed")
} finally {
  await new Promise((resolve) => server.close(resolve))
}
