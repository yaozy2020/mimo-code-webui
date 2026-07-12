import assert from "node:assert/strict"
import { appendProcessLog, createMimoRunArgs } from "./mimo.ts"

assert.deepEqual(
  createMimoRunArgs({ model: "openai/gpt-4o", prompt: "quote ' and ; rm -rf /" }),
  ["run", "--model", "openai/gpt-4o", "--format", "json", "quote ' and ; rm -rf /"],
  "mimo run arguments should preserve prompt as one argv item",
)

assert.equal(appendProcessLog("1234", "5678", 6), "345678", "process logs should retain only the bounded tail")

console.log("mimo command tests passed")
