import assert from "node:assert/strict"
import fs from "node:fs"
import { appendProcessLog, createMimoRunArgs } from "./mimo.ts"

assert.deepEqual(
  createMimoRunArgs({ model: "openai/gpt-4o", prompt: "quote ' and ; rm -rf /" }),
  ["run", "--model", "openai/gpt-4o", "--format", "json", "quote ' and ; rm -rf /"],
  "mimo run arguments should preserve prompt as one argv item",
)

assert.equal(appendProcessLog("1234", "5678", 6), "345678", "process logs should retain only the bounded tail")

const source = fs.readFileSync(new URL("./mimo.ts", import.meta.url), "utf8")
assert.match(source, /XDG_CONFIG_HOME: configHome/, "builtin model discovery must not inherit a broken user provider config")
assert.match(source, /fs\.rmSync\(configHome/, "builtin model discovery should remove its temporary config directory")

console.log("mimo command tests passed")
