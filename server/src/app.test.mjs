import assert from "node:assert/strict"
import http from "node:http"
import { createApp } from "./app.ts"

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

const { server, url } = await listen(
  createApp({
    authToken: "secret-token",
    host: "127.0.0.1",
    port: 0,
    workspaceRoot: "/tmp",
    mimoInfo: { url: "http://127.0.0.1:4096", port: 4096, pid: 0 },
    isMimoManaged: () => false,
    checkHealth: async () => ({ healthy: true, version: "test" }),
    getMimoPathInfo: async () => null,
    listManagedMimoServers: () => [],
    readMimoConfig: () => ({ provider: { unsafe: { options: { apiKey: "sk-secret" } } }, token: "secret" }),
    listManualModels: () => [],
    listBuiltinModels: async () => [],
    addMimoModelConfig: () => {
      throw new Error("baseUrl must use https")
    },
    probeNativeModel: async () => ({ supported: true }),
    restartMimo: async () => ({ ok: true, url: "http://127.0.0.1:4096" }),
    runMimoPrompt: async () => ({ text: "ok" }),
    resolveOpenAICompatibleModel: () => ({ providerID: "safe", modelID: "model", baseUrl: "https://api.example.com/v1" }),
    streamOpenAICompatible: async (_input, handlers) => {
      handlers.onStart?.()
      handlers.onDone?.()
    },
    proxy: (_req, res) => res.json({ ok: true }),
  }),
)

try {
  const status = await fetch(`${url}/status`)
  assert.equal(status.status, 200)
  const statusBody = await status.text()
  assert.equal(statusBody.includes("apiKey"), false, "/status should not expose apiKey field names")
  assert.equal(statusBody.includes("sk-secret"), false, "/status should not expose secret values")
  const statusJson = JSON.parse(statusBody)
  assert.equal(typeof statusJson.authRequired, "boolean")
  assert.equal(statusJson.mimo.healthy, true)
  assert.equal("workspaceRoot" in statusJson.mimo, false, "public /status should not expose workspaceRoot")
  assert.equal("projectServers" in statusJson.mimo, false, "public /status should not expose managed project servers")
  assert.equal("config" in statusJson, false, "public /status should not expose config summary")

  const unauthenticatedLocalStatus = await fetch(`${url}/local-status`)
  assert.equal(unauthenticatedLocalStatus.status, 401, "/local-status should require auth")

  const authenticatedLocalStatus = await fetch(`${url}/local-status`, {
    headers: { Authorization: "Bearer secret-token" },
  })
  assert.equal(authenticatedLocalStatus.status, 200)
  const authenticatedLocalStatusBody = await authenticatedLocalStatus.text()
  assert.equal(authenticatedLocalStatusBody.includes("workspaceRoot"), true)
  assert.equal(authenticatedLocalStatusBody.includes("sk-secret"), false)

  const unauthenticatedRun = await fetch(`${url}/local-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "safe/model", prompt: "hi" }),
  })
  assert.equal(unauthenticatedRun.status, 401, "/local-run should require auth when authToken is configured")

  const oversizedRun = await fetch(`${url}/local-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ model: "safe/model", prompt: "x".repeat(50001) }),
  })
  assert.equal(oversizedRun.status, 413, "/local-run should reject oversized prompts")

  const oversizedStream = await fetch(`${url}/local-run/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ model: "safe/model", prompt: "x".repeat(50001) }),
  })
  assert.equal(oversizedStream.status, 413, "/local-run/stream should reject oversized prompts before opening SSE")

  const unsafeModel = await fetch(`${url}/local-config/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ providerID: "metadata", modelID: "probe", baseUrl: "http://169.254.169.254/latest/meta-data" }),
  })
  assert.equal(unsafeModel.status, 400)
  assert.match(await unsafeModel.text(), /baseUrl must use https/i)

  const outsideWorkspace = await fetch(`${url}/api/session?directory=/`, {
    headers: { Authorization: "Bearer secret-token" },
  })
  assert.equal(outsideWorkspace.status, 400, "/api directory query should stay inside workspaceRoot")

  console.log("app route tests passed")
} finally {
  await new Promise((resolve) => server.close(resolve))
}
