import assert from "node:assert/strict"
import { createMimoRunArgs } from "./mimo.ts"

assert.deepEqual(
  createMimoRunArgs({ model: "openai/gpt-4o", prompt: "quote ' and ; rm -rf /" }),
  ["run", "--model", "openai/gpt-4o", "--format", "json", "quote ' and ; rm -rf /"],
  "mimo run arguments should preserve prompt as one argv item",
)

console.log("mimo command tests passed")
