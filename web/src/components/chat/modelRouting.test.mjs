import assert from "node:assert/strict"
import { chooseModelRoute } from "./modelRouting.ts"

assert.equal(
  chooseModelRoute({ selectedModel: undefined, runtimeModel: false }),
  "native",
  "default/no explicit model should use native",
)

assert.equal(
  chooseModelRoute({ selectedModel: { providerID: "mimo", modelID: "mimo-auto" }, runtimeModel: true }),
  "native",
  "mimo-auto should use native",
)

assert.equal(
  chooseModelRoute({ selectedModel: { providerID: "opencode-go", modelID: "kimi-k2.6" }, runtimeModel: false }),
  "native",
  "builtin/template models must try native before fallback",
)

console.log("modelRouting tests passed")
