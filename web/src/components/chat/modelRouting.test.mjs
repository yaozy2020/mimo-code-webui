import assert from "node:assert/strict"
import { chooseModelRoute, supportsNativeWorkspace } from "./modelRouting.ts"

assert.equal(
  chooseModelRoute({ selectedModel: undefined, nativeModelKeys: new Set() }),
  "native",
  "default/no explicit model should use native",
)

assert.equal(
  chooseModelRoute({ selectedModel: { providerID: "mimo", modelID: "mimo-auto" }, nativeModelKeys: new Set(["mimo/mimo-auto"]) }),
  "native",
  "mimo-auto in runtime config should use native",
)

assert.equal(
  chooseModelRoute({ selectedModel: { providerID: "opencode-go", modelID: "kimi-k2.6" }, nativeModelKeys: new Set(["opencode-go/kimi-k2.6"]) }),
  "native",
  "model present in runtime config should use native",
)

assert.equal(
  chooseModelRoute({ selectedModel: { providerID: "libwrt", modelID: "gpt-5.5" }, nativeModelKeys: new Set(["mimo/mimo-auto"]) }),
  "local-run",
  "model absent from runtime config should use local-run",
)

assert.equal(
  supportsNativeWorkspace({ provider: "openai", id: "gpt-4o-mini", tool_call: true }, new Set(["openai/gpt-4.1"])),
  false,
  "same provider is not enough; workspace support requires the exact provider/model in runtime config",
)

assert.equal(
  supportsNativeWorkspace({ provider: "openai", id: "gpt-4.1", tool_call: true }, new Set(["openai/gpt-4.1"])),
  true,
  "exact native model with tool calls should support workspace",
)

assert.equal(
  supportsNativeWorkspace({ provider: "openai", id: "gpt-4.1", tool_call: false }, new Set(["openai/gpt-4.1"])),
  false,
  "runtime model without tool calls should remain conversation-only",
)

console.log("modelRouting tests passed")
