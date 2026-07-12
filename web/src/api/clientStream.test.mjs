import assert from "node:assert/strict"
import { runLocalPromptStream } from "./client.ts"

const originalFetch = globalThis.fetch
globalThis.localStorage = { getItem: () => null }

function installStream(chunks, options = {}) {
  let index = 0
  const state = { cancels: 0, reads: 0, releases: 0 }
  globalThis.fetch = async () => ({
    ok: true,
    body: {
      getReader: () => ({
        async read() {
          state.reads += 1
          if (options.readError) throw options.readError
          if (index === chunks.length) {
            if (options.keepOpen) return new Promise(() => {})
            return { done: true, value: undefined }
          }
          return { done: false, value: new TextEncoder().encode(chunks[index++]) }
        },
        cancel() {
          state.cancels += 1
          if (options.cancelThrow) throw options.cancelThrow
          if (options.cancelError) return Promise.reject(options.cancelError)
          if (options.cancelPending) return new Promise(() => {})
          return Promise.resolve()
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

try {
  {
    const state = installStream(['data: {"type":"error","error":"terminal"}\n\n'], {
      cancelThrow: new Error("cancel threw"),
    })
    await assert.rejects(runLocalPromptStream({ model: "test", prompt: "hello" }, { onDelta() {} }), /terminal/)
    assert.deepEqual(state, { cancels: 1, reads: 1, releases: 1 })
  }

  {
    const primary = new Error("read failed")
    const state = installStream([], { readError: primary, cancelError: new Error("cleanup failed") })
    await assert.rejects(runLocalPromptStream({ model: "test", prompt: "hello" }, { onDelta() {} }), primary)
    assert.deepEqual(state, { cancels: 1, reads: 1, releases: 1 })
  }

  {
    const state = installStream(['data: {"type":"delta","text":"tail"}'])
    const deltas = []
    await assert.rejects(
      runLocalPromptStream({ model: "test", prompt: "hello" }, { onDelta: (text) => deltas.push(text) }),
      (error) => error.code === "STREAM_INCOMPLETE" && /不完整/.test(error.message),
    )
    assert.deepEqual(deltas, ["tail"])
    assert.deepEqual(state, { cancels: 0, reads: 2, releases: 1 })
  }

  {
    const state = installStream(['data: {"type":"done"}\n\n'], { cancelPending: true })
    let doneCalls = 0
    await Promise.race([
      runLocalPromptStream(
        { model: "test", prompt: "hello" },
        {
          onDelta() {},
          onDone: () => {
            doneCalls += 1
          },
        },
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("done stream waited for cancel")), 50)),
    ])
    assert.equal(doneCalls, 1)
    assert.deepEqual(state, { cancels: 1, reads: 1, releases: 1 })
  }

  {
    const state = installStream(['data: {"type":"error","error":"terminal"}\n\n'], { cancelPending: true })
    const result = await Promise.race([
      runLocalPromptStream({ model: "test", prompt: "hello" }, { onDelta() {} }).then(
        () => ({ status: "fulfilled" }),
        (error) => ({ status: "rejected", error }),
      ),
      new Promise((resolve) => setTimeout(() => resolve({ status: "timeout" }), 50)),
    ])
    assert.equal(result.status, "rejected")
    assert.match(result.error.message, /terminal/)
    assert.deepEqual(state, { cancels: 1, reads: 1, releases: 1 })
  }

  {
    const state = installStream(
      [
        [
          'data: {"type":"delta","text":"before"}',
          'data: {"type":"done"}',
          'data: {"type":"done"}',
          'data: {"type":"delta","text":"late-same-chunk"}',
        ].join("\n\n") + "\n\n",
        'data: {"type":"delta","text":"late-next-chunk"}\n\n',
      ],
      {
        keepOpen: true,
        cancelError: new Error("cancel cleanup failed"),
        releaseError: new Error("release cleanup failed"),
      },
    )
    const deltas = []
    let doneCalls = 0
    await Promise.race([
      runLocalPromptStream(
        { model: "test", prompt: "hello" },
        {
          onDelta: (text) => deltas.push(text),
          onDone: () => {
            doneCalls += 1
          },
        },
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("stream did not terminate on done")), 50)),
    ])
    assert.deepEqual(deltas, ["before"])
    assert.equal(doneCalls, 1)
    assert.deepEqual(state, { cancels: 1, reads: 1, releases: 1 })
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log("Local prompt stream lifecycle tests passed")
