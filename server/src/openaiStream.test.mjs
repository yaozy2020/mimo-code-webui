import assert from "node:assert/strict"
import { createOpenAIStreamError, streamOpenAICompatible } from "./openaiStream.ts"

const unsupported = createOpenAIStreamError(
  { error: { message: "Streaming is unavailable", code: "STREAM_UNSUPPORTED" } },
  "fallback",
)
assert.equal(unsupported.message, "Streaming is unavailable")
assert.equal(unsupported.code, "STREAM_UNSUPPORTED")
assert.equal(createOpenAIStreamError({ error: { message: "provider failed" } }, "fallback").code, undefined)

const originalFetch = globalThis.fetch

function installStream(chunks, options = {}) {
  let index = 0
  const state = { reads: 0, cancels: 0, releases: 0 }
  globalThis.fetch = async () => ({
    ok: true,
    body: {
      getReader: () => ({
        async read() {
          state.reads += 1
          if (index === chunks.length) return { done: true, value: undefined }
          return { done: false, value: new TextEncoder().encode(chunks[index++]) }
        },
        async cancel() {
          state.cancels += 1
          if (options.cancelPending) return new Promise(() => {})
          if (options.cancelError) throw options.cancelError
        },
        releaseLock() {
          state.releases += 1
          if (options.releaseError) throw options.releaseError
        },
      }),
    },
  })
  return state
}

async function run(chunks, options) {
  const events = []
  const state = installStream(chunks, options)
  const promise = streamOpenAICompatible(
    { model: { modelID: "test", baseUrl: "https://8.8.8.8" }, prompt: "hello" },
    {
      onDelta: (text) => events.push(["delta", text]),
      onError: (message) => events.push(["error", message]),
      onDone: () => events.push(["done"]),
    },
  )
  return { events, state, promise }
}

try {
  {
    const { events, state, promise } = await run(['data: {"choices":[{"delta":{"content":"tail"}}]}'])
    await assert.rejects(promise, (error) => error.code === "STREAM_INCOMPLETE" && /incomplete/i.test(error.message))
    assert.deepEqual(events, [["delta", "tail"]])
    assert.equal(state.cancels, 0)
    assert.equal(state.releases, 1)
  }

  for (const payload of [
    { error: { message: "provider failed" } },
    { error: { message: "Streaming unavailable", code: "STREAM_UNSUPPORTED" } },
  ]) {
    const { events, state, promise } = await run([`data: ${JSON.stringify(payload)}\n`])
    await assert.rejects(promise, (error) => error.message === payload.error.message && error.code === payload.error.code)
    assert.deepEqual(events, payload.error.code ? [] : [["error", "provider failed"]])
    assert.equal(state.cancels, 1)
    assert.equal(state.releases, 1)
  }

  for (const payload of [
    { error: { message: "EOF provider failed" } },
    { error: { message: "EOF unsupported", code: "STREAM_UNSUPPORTED" } },
  ]) {
    const { state, promise } = await run([`data: ${JSON.stringify(payload)}`])
    await assert.rejects(promise, (error) => error.message === payload.error.message && error.code === payload.error.code)
    assert.equal(state.cancels, 0)
    assert.equal(state.releases, 1)
  }

  {
    const { events, state, promise } = await run([
      'data: {"choices":[{"delta":{"content":"one"}}]}\n\ndata: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"late"}}]}\n\n',
    ])
    await promise
    assert.deepEqual(events, [["delta", "one"], ["done"]])
    assert.equal(state.reads, 1)
    assert.equal(state.cancels, 1)
    assert.equal(state.releases, 1)
  }

  {
    const primary = new Error("provider failed")
    const { state, promise } = await run(
      ['data: {"error":{"message":"provider failed"}}\n'],
      { cancelError: new Error("cleanup failed") },
    )
    await assert.rejects(promise, primary)
    assert.equal(state.releases, 1)
  }

  for (const { chunk, expectedEvents, expectedError } of [
    { chunk: "data: [DONE]\n", expectedEvents: [["done"]] },
    {
      chunk: 'data: {"error":{"message":"provider failed"}}\n',
      expectedEvents: [["error", "provider failed"]],
      expectedError: "provider failed",
    },
  ]) {
    const { events, state, promise } = await run([chunk], {
      cancelPending: true,
      releaseError: new Error("release while cancellation is pending"),
    })
    const settled = Promise.race([
      promise.then(() => "resolved", (error) => error.message),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 50)),
    ])
    assert.equal(await settled, expectedError ?? "resolved", "protocol termination must not await reader cancellation")
    assert.deepEqual(events, expectedEvents)
    assert.equal(state.cancels, 1)
    assert.equal(state.releases, 1)
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log("OpenAI streaming lifecycle tests passed")
