import assert from "node:assert/strict"
import { probePromptRoute } from "./promptRouteProbe.ts"

let resolveModels
let receivedSignal
let receivedDirectory
const models = new Promise((resolve) => {
  resolveModels = resolve
})
const controller = new AbortController()
const probe = probePromptRoute(
  { providerID: "manual", modelID: "model" },
  controller.signal,
  (directory, signal) => {
    receivedDirectory = directory
    receivedSignal = signal
    return models
  },
  "/tmp/project with spaces",
)
assert.equal(receivedDirectory, "/tmp/project with spaces")
assert.equal(receivedSignal, controller.signal)
controller.abort()
resolveModels([])
await assert.rejects(probe, (error) => error instanceof DOMException && error.name === "AbortError")

const nativeFetch = globalThis.fetch
let requestedUrl
globalThis.localStorage = { getItem: () => null }
globalThis.fetch = async (input) => {
  requestedUrl = String(input)
  return new Response(JSON.stringify({ provider: {} }), { headers: { "Content-Type": "application/json" } })
}
try {
  const { fetchRuntimeModels } = await import("../../api/client.ts")
  await fetchRuntimeModels("/tmp/project with spaces")
  assert.equal(requestedUrl, "/api/config?directory=%2Ftmp%2Fproject+with+spaces")
} finally {
  globalThis.fetch = nativeFetch
  delete globalThis.localStorage
}

console.log("prompt route probe cancellation tests passed")
