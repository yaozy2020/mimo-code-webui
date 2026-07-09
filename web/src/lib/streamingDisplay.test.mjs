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

console.log("streaming display tests passed")
