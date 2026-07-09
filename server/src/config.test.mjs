import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { addMimoModelConfig, resolveOpenAICompatibleModel } from "./config.ts"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-config-test-"))
const configPath = path.join(tempDir, "config.json")
process.env.MIMO_CONFIG_PATH = configPath

try {
  const result = addMimoModelConfig({
    providerID: "openai",
    modelID: "gpt-4o-mini",
    name: "GPT 4o Mini",
    baseUrl: "https://api.openai.com/v1",
    tool_call: false,
    attachment: false,
    reasoning: true,
  })

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
  const model = config.provider.openai.models["gpt-4o-mini"]

  assert.equal(model.tool_call, false, "manual tool_call capability should be persisted")
  assert.equal(model.attachment, false, "manual attachment capability should be persisted")
  assert.equal(model.reasoning, true, "manual reasoning capability should be persisted")
  assert.equal(result.tool_call, false, "returned summary should include persisted tool_call")
  assert.equal(result.attachment, false, "returned summary should include persisted attachment")
  assert.equal(result.reasoning, true, "returned summary should include persisted reasoning")

  assert.throws(
    () =>
      addMimoModelConfig({
        providerID: "metadata",
        modelID: "probe",
        baseUrl: "http://169.254.169.254/latest/meta-data",
      }),
    /baseUrl must use https/i,
    "manual model config should reject non-https metadata endpoints",
  )

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      provider: {
        unsafe: {
          api: "https://10.0.0.2/v1",
          options: { apiKey: "secret" },
          models: { probe: { name: "Probe" } },
        },
      },
    }),
    "utf-8",
  )

  assert.throws(
    () => resolveOpenAICompatibleModel("unsafe/probe"),
    /baseUrl host is not allowed/i,
    "runtime model resolution should reject private network baseUrl hosts",
  )

  console.log("config tests passed")
} finally {
  delete process.env.MIMO_CONFIG_PATH
  fs.rmSync(tempDir, { recursive: true, force: true })
}
