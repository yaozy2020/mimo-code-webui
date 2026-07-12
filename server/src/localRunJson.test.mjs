import assert from "node:assert/strict"
import http from "node:http"
import { createApp } from "./app.ts"

function options(runMimoPrompt, localRunTimeoutMs = 100) {
  return {
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
    listBuiltinModels: () => [],
    addMimoModelConfig: () => ({}),
    probeNativeModel: () => ({ supported: true }),
    restartMimo: async () => ({ ok: true }),
    runMimoPrompt,
    runReadonlyCliCommand: async () => ({}),
    resolveOpenAICompatibleModel: () => ({ providerID: "test", modelID: "model", baseUrl: "https://example.invalid/v1" }),
    streamOpenAICompatible: async () => {},
    localRunTimeoutMs,
  }
}

async function listen(app) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve))
}

{
  let active = 0
  let aborted = false
  let cleanupFinished = false
  const fixture = await listen(createApp(options(async ({ signal }) => {
    active += 1
    await new Promise((resolve) => signal.addEventListener("abort", () => {
      aborted = true
      setTimeout(() => {
        active -= 1
        cleanupFinished = true
        resolve()
      }, 50)
    }, { once: true }))
    throw signal.reason
  }, 10)))
  try {
    const response = await fetch(`${fixture.url}/local-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test/model", prompt: "wait" }),
    })
    assert.equal(response.status, 504)
    assert.deepEqual(await response.json(), { error: "Local run timed out" })
    assert.equal(aborted, true, "timeout should abort the provider task")
    assert.equal(active, 1, "504 must not wait for provider cleanup to settle")
    assert.equal(cleanupFinished, false, "cleanup should continue after the 504 response")
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(active, 0, "background cleanup should eventually release the provider task")
    assert.equal(cleanupFinished, true)
  } finally {
    await close(fixture.server)
  }
}

{
  let unhandled = null
  const onUnhandled = (error) => { unhandled = error }
  process.on("unhandledRejection", onUnhandled)
  const fixture = await listen(createApp(options(async ({ signal }) => {
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
    throw new Error("cleanup failed")
  }, 10)))
  try {
    const response = await fetch(`${fixture.url}/local-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test/model", prompt: "wait" }),
    })
    assert.equal(response.status, 504)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(unhandled, null, "post-deadline provider rejection must be absorbed")
  } finally {
    process.off("unhandledRejection", onUnhandled)
    await close(fixture.server)
  }
}

{
  let started
  const didStart = new Promise((resolve) => { started = resolve })
  let released
  const didRelease = new Promise((resolve) => { released = resolve })
  const fixture = await listen(createApp(options(async ({ signal }) => {
    started()
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
    released(signal.aborted)
    throw signal.reason
  })))
  try {
    const request = http.request(`${fixture.url}/local-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    request.on("error", () => {})
    request.end(JSON.stringify({ model: "test/model", prompt: "disconnect" }))
    await didStart
    request.destroy()
    assert.equal(await Promise.race([didRelease, new Promise((resolve) => setTimeout(() => resolve(false), 200))]), true,
      "client disconnect should abort and release the provider task")
  } finally {
    await close(fixture.server)
  }
}

{
  let receivedSignal
  const fixture = await listen(createApp(options(async ({ signal }) => {
    receivedSignal = signal
    return { text: "ok" }
  })))
  try {
    const response = await fetch(`${fixture.url}/local-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test/model", prompt: "normal" }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { text: "ok" })
    assert.equal(receivedSignal instanceof AbortSignal, true)
    assert.equal(receivedSignal.aborted, false)
  } finally {
    await close(fixture.server)
  }
}

console.log("local-run JSON cancellation and timeout tests passed")
