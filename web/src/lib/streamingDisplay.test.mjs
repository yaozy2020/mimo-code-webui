import assert from "node:assert/strict"
import { nextStreamingDisplay } from "./streamingDisplay.ts"

assert.equal(
  nextStreamingDisplay("hello", "hello world"),
  "hello wor",
  "display should reveal a small chunk instead of jumping to the full source",
)

assert.equal(
  nextStreamingDisplay("hello world", "replacement"),
  "replacement",
  "content replacement should align immediately instead of preserving stale text",
)

assert.equal(
  nextStreamingDisplay("complete", "complete"),
  "complete",
  "completed content should remain stable",
)

const largeBacklog = nextStreamingDisplay("", "x".repeat(8000))
assert.equal(
  largeBacklog.length <= 64,
  true,
  "a large streaming backlog must not add dozens of rendered lines in one frame",
)

let caughtUp = ""
const longSource = "x".repeat(8000)
for (let frame = 0; frame < 160; frame += 1) caughtUp = nextStreamingDisplay(caughtUp, longSource)
assert.equal(caughtUp, longSource, "an 8000-character backlog should catch up within about 3.2 seconds")

const emojiBoundary = nextStreamingDisplay("", `${"x".repeat(63)}😀${"x".repeat(8000)}`)
assert.equal(/\p{Surrogate}/u.test(emojiBoundary), false, "streaming display must not split an emoji surrogate pair")

console.log("streaming display tests passed")
