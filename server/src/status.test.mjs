import assert from "node:assert/strict"
import { createPublicConfigSummary, containsSensitiveKey } from "./status.ts"

const config = {
  provider: {
    go: {
      name: "go",
      options: {
        apiKey: "sk-secret",
        authorization: "Bearer secret",
      },
      models: {
        "kimi-k2.7-code": {
          name: "Kimi",
          tool_call: true,
          attachment: true,
          reasoning: true,
        },
      },
    },
  },
  command: {
    test: { description: "Run tests", template: "npm test", token: "secret" },
  },
  secret: "top-secret",
}

const summary = createPublicConfigSummary(config)
const serialized = JSON.stringify(summary)

assert.equal(containsSensitiveKey(summary), false, "public status summary should not contain sensitive key names")
assert.equal(serialized.includes("sk-secret"), false, "public status summary should not contain secret values")
assert.equal(serialized.includes("authorization"), false, "public status summary should not contain authorization fields")
assert.equal(summary.provider.go.name, "go")
assert.equal(summary.provider.go.models["kimi-k2.7-code"].tool_call, true)
assert.equal(summary.command.test.description, "Run tests")
assert.equal(summary.command.test.template, undefined)

console.log("status redaction tests passed")
