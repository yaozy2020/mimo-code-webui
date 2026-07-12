import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import { createApp } from "./app.ts"
import { streamOpenAICompatible } from "./openaiStream.ts"
import { runLocalPromptStream } from "../../web/src/api/client.ts"

const controllerSource = fs.readFileSync(new URL("../../web/src/components/chat/usePromptController.ts", import.meta.url), "utf8")
const fallbackMatch = controllerSource.match(/export function shouldFallbackLocalRun\([^]*?\n}/)
assert.ok(fallbackMatch, "shouldFallbackLocalRun should be exported")
const shouldFallbackLocalRun = Function(`${fallbackMatch[0]
  .replace("export function", "function")
  .replace(/: unknown/g, "")}; return shouldFallbackLocalRun`)()

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
    getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
    isMimoManaged: () => false,
    getMimoSupervisorStatus: () => ({ restartCount: 2, consecutiveFailures: 0, lastRestartReason: "operator_request" }),
    checkHealth: async () => ({ healthy: true, version: "test" }),
    getMimoPathInfo: async () => null,
    listManagedMimoServers: () => [],
    readMimoConfig: () => ({ provider: { unsafe: { options: { apiKey: "sk-secret" } } }, token: "secret" }),
    listManualModels: () => [],
    listBuiltinModels: async () => [],
    addMimoModelConfig: () => {
      throw new Error("config write failed at /home/user/.config/mimocode/config.json")
    },
    probeNativeModel: async () => ({ supported: true }),
    restartMimo: async () => ({ ok: true, url: "http://127.0.0.1:4096" }),
    runMimoPrompt: async () => ({ text: "ok" }),
    runReadonlyCliCommand: async (id) => {
      if (id !== "stats") throw new Error("unsupported")
      return { command: "mimo", args: [id], stdout: `ran ${id}`, stderr: "" }
    },
    resolveOpenAICompatibleModel: () => ({ providerID: "safe", modelID: "model", baseUrl: "https://api.example.com/v1" }),
    streamOpenAICompatible: async (_input, handlers) => {
      handlers.onStart?.()
      handlers.onDone?.()
    },
    proxy: (_req, res) => res.json({ ok: true }),
    rateLimit: { windowMs: 60_000, max: 100 },
    getBackupStatus: () => ({ state: "degraded", reason: "last backup attempt failed" }),
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
  assert.match(status.headers.get("x-request-id") ?? "", /\S+/, "/status should include a request id")

  const providedRequestID = "test-request-id-123"
  const requestIDStatus = await fetch(`${url}/status`, { headers: { "X-Request-ID": providedRequestID } })
  assert.equal(requestIDStatus.headers.get("x-request-id"), providedRequestID, "server should preserve incoming request id")

  const unauthenticatedLocalStatus = await fetch(`${url}/local-status`)
  assert.equal(unauthenticatedLocalStatus.status, 401, "/local-status should require auth")

  const authenticatedLocalStatus = await fetch(`${url}/local-status`, {
    headers: { Authorization: "Bearer secret-token" },
  })
  assert.equal(authenticatedLocalStatus.status, 200)
  const authenticatedLocalStatusBody = await authenticatedLocalStatus.text()
  assert.equal(authenticatedLocalStatusBody.includes("workspaceRoot"), true)
  assert.equal(authenticatedLocalStatusBody.includes("sk-secret"), false)
  assert.equal(JSON.parse(authenticatedLocalStatusBody).backup.state, "degraded")
  assert.equal(JSON.parse(authenticatedLocalStatusBody).mimo.supervisor.restartCount, 2)
  assert.equal(statusBody.includes("restartCount"), false, "public /status should not expose supervisor metrics")
  assert.equal(statusBody.includes("backup"), false, "public /status should not expose backup state")

  const login = await fetch(`${url}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "secret-token" }),
  })
  assert.equal(login.status, 204, "/login should accept the configured auth token")
  const cookie = login.headers.get("set-cookie") ?? ""
  assert.match(cookie, /mimo_webui_auth=/, "/login should set auth cookie")
  assert.match(cookie, /HttpOnly/i, "auth cookie should be HttpOnly")
  assert.match(cookie, /SameSite=Lax/i, "auth cookie should be SameSite=Lax")

  const cookieLocalStatus = await fetch(`${url}/local-status`, { headers: { Cookie: cookie } })
  assert.equal(cookieLocalStatus.status, 200, "auth cookie should authorize protected local routes")

  const logout = await fetch(`${url}/logout`, { method: "POST", headers: { Cookie: cookie } })
  assert.equal(logout.status, 204, "/logout should clear auth cookie")
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/i)

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

  const unauthenticatedCli = await fetch(`${url}/local-cli/commands/stats`)
  assert.equal(unauthenticatedCli.status, 401, "/local-cli commands should require auth when authToken is configured")

  const authenticatedCli = await fetch(`${url}/local-cli/commands/stats`, { headers: { Authorization: "Bearer secret-token" } })
  assert.equal(authenticatedCli.status, 200)
  assert.deepEqual(await authenticatedCli.json(), { command: "mimo", args: ["stats"], stdout: "ran stats", stderr: "" })

  const invalidCli = await fetch(`${url}/local-cli/commands/upgrade`, { headers: { Authorization: "Bearer secret-token" } })
  assert.equal(invalidCli.status, 400, "unsupported local CLI commands should be rejected")

  const unsafeModel = await fetch(`${url}/local-config/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ providerID: "metadata", modelID: "probe", baseUrl: "http://169.254.169.254/latest/meta-data" }),
  })
  assert.equal(unsafeModel.status, 400)
  const unsafeModelText = await unsafeModel.text()
  assert.match(unsafeModelText, /Invalid model configuration/i)
  assert.equal(unsafeModelText.includes("/home/user"), false, "error responses should not expose server paths")

  const invalidRestartServer = await listen(
    createApp({
      authToken: "secret-token",
      host: "127.0.0.1",
      port: 0,
      workspaceRoot: "/tmp",
      getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
      isMimoManaged: () => false,
      checkHealth: async () => ({ healthy: true, version: "test" }),
      getMimoPathInfo: async () => null,
      listManagedMimoServers: () => [],
      readMimoConfig: () => ({}),
      listManualModels: () => [],
      listBuiltinModels: async () => [],
      addMimoModelConfig: () => ({}),
      probeNativeModel: async () => ({ supported: true }),
      restartMimo: async () => {
        throw new Error("spawn failed at /usr/local/bin/mimo")
      },
      runMimoPrompt: async () => ({ text: "ok" }),
      runReadonlyCliCommand: async () => ({ command: "mimo", args: [], stdout: "", stderr: "" }),
      resolveOpenAICompatibleModel: () => ({ providerID: "safe", modelID: "model", baseUrl: "https://api.example.com/v1" }),
      streamOpenAICompatible: async (_input, handlers) => handlers.onDone?.(),
      rateLimit: { windowMs: 60_000, max: 100 },
    }),
  )
  try {
    const leakedError = await fetch(`${invalidRestartServer.url}/local-config/restart-mimo`, {
      method: "POST",
      headers: { Authorization: "Bearer secret-token" },
    })
    assert.equal(leakedError.status, 500)
    const leakedErrorText = await leakedError.text()
    assert.match(leakedErrorText, /Failed to restart mimo serve/i)
    assert.equal(leakedErrorText.includes("/usr/local/bin"), false, "500 errors should not expose process paths")
  } finally {
    await new Promise((resolve) => invalidRestartServer.server.close(resolve))
  }

  let currentMimoInfo = { url: "http://127.0.0.1:4096", port: 4096, pid: 1 }
  const dynamicBaseCalls = []
  const dynamicBaseServer = await listen(createApp({
    authToken: "secret-token",
    host: "127.0.0.1",
    port: 0,
    workspaceRoot: "/tmp",
    getMimoInfo: () => currentMimoInfo,
    isMimoManaged: () => true,
    checkHealth: async (baseUrl) => { dynamicBaseCalls.push(["health", baseUrl]); return { healthy: true } },
    getMimoPathInfo: async (baseUrl) => { dynamicBaseCalls.push(["path", baseUrl]); return { directory: "/tmp" } },
    listManagedMimoServers: () => [],
    readMimoConfig: () => ({}),
    listManualModels: () => [],
    listBuiltinModels: async () => [],
    addMimoModelConfig: () => ({}),
    probeNativeModel: async ({ baseUrl }) => { dynamicBaseCalls.push(["probe", baseUrl]); return { supported: true } },
    restartMimo: async () => ({ ok: true }),
    runMimoPrompt: async () => ({ text: "ok" }),
    runReadonlyCliCommand: async () => ({}),
    resolveOpenAICompatibleModel: () => ({ modelID: "model", baseUrl: "https://8.8.8.8/v1" }),
    streamOpenAICompatible: async () => {},
  }))
  try {
    currentMimoInfo = { url: "http://127.0.0.1:4199", port: 4199, pid: 2 }
    const headers = { Authorization: "Bearer secret-token", "Content-Type": "application/json" }
    await fetch(`${dynamicBaseServer.url}/status`)
    const localStatus = await fetch(`${dynamicBaseServer.url}/local-status`, { headers })
    assert.equal((await localStatus.json()).mimo.url, currentMimoInfo.url)
    await fetch(`${dynamicBaseServer.url}/local-config/native-model-probe`, { method: "POST", headers, body: JSON.stringify({ model: "test/model" }) })
    assert.deepEqual(dynamicBaseCalls, [
      ["health", currentMimoInfo.url],
      ["health", currentMimoInfo.url],
      ["path", currentMimoInfo.url],
      ["probe", currentMimoInfo.url],
    ])
  } finally {
    await new Promise((resolve) => dynamicBaseServer.server.close(resolve))
  }

  const rateLimitedServer = await listen(
    createApp({
      authToken: "secret-token",
      host: "127.0.0.1",
      port: 0,
      workspaceRoot: "/tmp",
      getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
      isMimoManaged: () => false,
      checkHealth: async () => ({ healthy: true, version: "test" }),
      getMimoPathInfo: async () => null,
      listManagedMimoServers: () => [],
      readMimoConfig: () => ({}),
      listManualModels: () => [],
      listBuiltinModels: async () => [],
      addMimoModelConfig: () => ({}),
      probeNativeModel: async () => ({ supported: true }),
      restartMimo: async () => ({ ok: true }),
      runMimoPrompt: async () => ({ text: "ok" }),
      runReadonlyCliCommand: async () => ({ command: "mimo", args: [], stdout: "", stderr: "" }),
      resolveOpenAICompatibleModel: () => ({ providerID: "safe", modelID: "model", baseUrl: "https://api.example.com/v1" }),
      streamOpenAICompatible: async (_input, handlers) => handlers.onDone?.(),
      rateLimit: { windowMs: 60_000, max: 2 },
    }),
  )
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer secret-token" }
    assert.equal((await fetch(`${rateLimitedServer.url}/local-run`, { method: "POST", headers, body: JSON.stringify({ model: "safe/model", prompt: "one" }) })).status, 200)
    assert.equal((await fetch(`${rateLimitedServer.url}/local-run`, { method: "POST", headers, body: JSON.stringify({ model: "safe/model", prompt: "two" }) })).status, 200)
    assert.equal((await fetch(`${rateLimitedServer.url}/local-run`, { method: "POST", headers, body: JSON.stringify({ model: "safe/model", prompt: "three" }) })).status, 429)
  } finally {
    await new Promise((resolve) => rateLimitedServer.server.close(resolve))
  }

  const timeoutServer = await listen(
    createApp({
      authToken: "secret-token",
      host: "127.0.0.1",
      port: 0,
      workspaceRoot: "/tmp",
      getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
      isMimoManaged: () => false,
      checkHealth: async () => ({ healthy: true }),
      getMimoPathInfo: async () => null,
      listManagedMimoServers: () => [],
      readMimoConfig: () => ({}),
      listManualModels: () => [],
      listBuiltinModels: async () => [],
      addMimoModelConfig: () => ({}),
      probeNativeModel: async () => ({ supported: true }),
      restartMimo: async () => ({ ok: true }),
      runMimoPrompt: async () => ({ text: "ok" }),
      runReadonlyCliCommand: async () => ({}),
      resolveOpenAICompatibleModel: () => ({ providerID: "safe", modelID: "model", baseUrl: "https://api.example.com/v1" }),
      streamOpenAICompatible: async () => new Promise(() => {}),
      localRunTimeoutMs: 10,
    }),
  )
  try {
    const response = await fetch(`${timeoutServer.url}/local-run/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
      body: JSON.stringify({ model: "safe/model", prompt: "wait" }),
    })
    const body = await response.text()
    const frames = body.split("\n\n").filter(Boolean).map((frame) => JSON.parse(frame.replace(/^data: /, "")))
    assert.deepEqual(frames, [{ type: "error", error: "Local run timed out" }])
  } finally {
    await new Promise((resolve) => timeoutServer.server.close(resolve))
  }

  for (const { terminal, expectedFrames } of [
    {
      terminal: (handlers) => handlers.onDone?.(),
      expectedFrames: [{ type: "done" }],
    },
    {
      terminal: (handlers) => handlers.onError?.("provider failed"),
      expectedFrames: [{ type: "error", error: "provider failed" }],
    },
  ]) {
    const terminalServer = await listen(
      createApp({
        authToken: "secret-token",
        host: "127.0.0.1",
        port: 0,
        workspaceRoot: "/tmp",
        getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
        isMimoManaged: () => false,
        checkHealth: async () => ({ healthy: true }),
        getMimoPathInfo: async () => null,
        listManagedMimoServers: () => [],
        readMimoConfig: () => ({}),
        listManualModels: () => [],
        listBuiltinModels: async () => [],
        addMimoModelConfig: () => ({}),
        probeNativeModel: async () => ({ supported: true }),
        restartMimo: async () => ({ ok: true }),
        runMimoPrompt: async () => ({ text: "ok" }),
        runReadonlyCliCommand: async () => ({}),
        resolveOpenAICompatibleModel: () => ({ modelID: "model", baseUrl: "https://8.8.8.8/v1" }),
        streamOpenAICompatible: async (_input, handlers) => {
          terminal(handlers)
          await new Promise(() => {})
        },
        localRunTimeoutMs: 100,
      }),
    )
    try {
      const startedAt = Date.now()
      const response = await fetch(`${terminalServer.url}/local-run/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
        body: JSON.stringify({ model: "safe/model", prompt: "terminal" }),
      })
      const frames = (await response.text()).split("\n\n").filter(Boolean)
        .map((frame) => JSON.parse(frame.replace(/^data: /, "")))
      assert.ok(Date.now() - startedAt < 80, "protocol termination should complete before the app timeout")
      assert.deepEqual(frames, expectedFrames)
      await new Promise((resolve) => setTimeout(resolve, 120))
      assert.deepEqual(frames, expectedFrames, "the cleared timeout must not append another terminal error")
    } finally {
      await new Promise((resolve) => terminalServer.server.close(resolve))
    }
  }

  for (const { callbacks, expectedFrames } of [
    {
      callbacks: (handlers) => {
        handlers.onDone?.()
        handlers.onDelta?.("late delta")
        handlers.onDone?.()
        handlers.onError?.("late error")
      },
      expectedFrames: [{ type: "done" }],
    },
    {
      callbacks: (handlers) => {
        handlers.onError?.("provider failed")
        handlers.onDelta?.("late delta")
        handlers.onDone?.()
      },
      expectedFrames: [{ type: "error", error: "provider failed" }],
    },
  ]) {
    const callbackOrderServer = await listen(
      createApp({
        authToken: "secret-token",
        host: "127.0.0.1",
        port: 0,
        workspaceRoot: "/tmp",
        getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
        isMimoManaged: () => false,
        checkHealth: async () => ({ healthy: true }),
        getMimoPathInfo: async () => null,
        listManagedMimoServers: () => [],
        readMimoConfig: () => ({}),
        listManualModels: () => [],
        listBuiltinModels: async () => [],
        addMimoModelConfig: () => ({}),
        probeNativeModel: async () => ({ supported: true }),
        restartMimo: async () => ({ ok: true }),
        runMimoPrompt: async () => ({ text: "ok" }),
        runReadonlyCliCommand: async () => ({}),
        resolveOpenAICompatibleModel: () => ({ modelID: "model", baseUrl: "https://8.8.8.8/v1" }),
        streamOpenAICompatible: async (_input, handlers) => callbacks(handlers),
      }),
    )
    try {
      const response = await fetch(`${callbackOrderServer.url}/local-run/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
        body: JSON.stringify({ model: "safe/model", prompt: "terminal order" }),
      })
      const frames = (await response.text()).split("\n\n").filter(Boolean)
        .map((frame) => JSON.parse(frame.replace(/^data: /, "")))
      assert.deepEqual(frames, expectedFrames, "callbacks after a terminal frame must be ignored")
    } finally {
      await new Promise((resolve) => callbackOrderServer.server.close(resolve))
    }
  }

  const streamErrorServer = await listen(
    createApp({
      authToken: "secret-token",
      host: "127.0.0.1",
      port: 0,
      workspaceRoot: "/tmp",
      getMimoInfo: () => ({ url: "http://127.0.0.1:4096", port: 4096, pid: 0 }),
      isMimoManaged: () => false,
      checkHealth: async () => ({ healthy: true }),
      getMimoPathInfo: async () => null,
      listManagedMimoServers: () => [],
      readMimoConfig: () => ({}),
      listManualModels: () => [],
      listBuiltinModels: async () => [],
      addMimoModelConfig: () => ({}),
      probeNativeModel: async () => ({ supported: true }),
      restartMimo: async () => ({ ok: true }),
      runMimoPrompt: async () => ({ text: "ok" }),
      runReadonlyCliCommand: async () => ({}),
      resolveOpenAICompatibleModel: () => ({ modelID: "model", baseUrl: "https://8.8.8.8/v1" }),
      streamOpenAICompatible,
      rateLimit: { windowMs: 60_000, max: 100 },
    }),
  )
  const nativeFetch = globalThis.fetch
  try {
    globalThis.fetch = (input, init) => {
      const requestUrl = new URL(String(input), streamErrorServer.url)
      if (requestUrl.hostname === "8.8.8.8") {
        const prompt = JSON.parse(String(init?.body)).messages[0].content
        const error = prompt === "unsupported"
          ? { message: "Streaming is unavailable", code: "STREAM_UNSUPPORTED" }
          : { message: "provider failed" }
        return Promise.resolve(new Response(`data: ${JSON.stringify({ error })}\n\n`, {
          headers: { "Content-Type": "text/event-stream" },
        }))
      }
      return nativeFetch(requestUrl, init)
    }
    const headers = { "Content-Type": "application/json", Authorization: "Bearer secret-token" }
    const unsupportedResponse = await fetch(`${streamErrorServer.url}/local-run/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "safe/model", prompt: "unsupported" }),
    })
    const unsupportedFrames = (await unsupportedResponse.text()).split("\n\n").filter(Boolean)
      .map((frame) => JSON.parse(frame.replace(/^data: /, "")))
    assert.deepEqual(unsupportedFrames, [
      { type: "start" },
      { type: "error", error: "Local stream failed", code: "STREAM_UNSUPPORTED" },
    ], "unsupported streams should expose one coded terminal error")

    const providerResponse = await fetch(`${streamErrorServer.url}/local-run/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "safe/model", prompt: "provider-error" }),
    })
    const providerFrames = (await providerResponse.text()).split("\n\n").filter(Boolean)
      .map((frame) => JSON.parse(frame.replace(/^data: /, "")))
    assert.deepEqual(providerFrames, [
      { type: "start" },
      { type: "error", error: "provider failed" },
    ], "ordinary provider failures should expose one uncoded terminal error")

    try {
      const routeFetch = globalThis.fetch
      const nativeLocalStorage = globalThis.localStorage
      globalThis.localStorage = { getItem: () => null }
      globalThis.fetch = (input, init) => routeFetch(input, {
        ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: "Bearer secret-token" },
      })
      try {
        const clientError = await runLocalPromptStream(
          { model: "safe/model", prompt: "unsupported" },
          { onDelta: () => {} },
        ).then(() => null, (error) => error)
        assert.equal(shouldFallbackLocalRun(clientError), true, "the frontend should receive the typed fallback code")
      } finally {
        globalThis.localStorage = nativeLocalStorage
      }
    } finally {
      globalThis.fetch = nativeFetch
    }
  } finally {
    globalThis.fetch = nativeFetch
    await new Promise((resolve) => streamErrorServer.server.close(resolve))
  }

  const largeBody = await fetch(`${url}/local-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
    body: JSON.stringify({ model: "safe/model", prompt: "x", padding: "y".repeat(300_000) }),
  })
  assert.equal(largeBody.status, 413, "JSON parser should reject oversized request bodies")

  const outsideWorkspace = await fetch(`${url}/api/session?directory=/`, {
    headers: { Authorization: "Bearer secret-token" },
  })
  assert.equal(outsideWorkspace.status, 400, "/api directory query should stay inside workspaceRoot")

  console.log("app route tests passed")
} finally {
  await new Promise((resolve) => server.close(resolve))
}
