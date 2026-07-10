import assert from "node:assert/strict"
import { createCliCommandRunner, readonlyCliCommands } from "./cliCommands.ts"

assert.deepEqual(
  Object.keys(readonlyCliCommands).sort(),
  ["agents", "debug-config", "debug-paths", "mcp", "sessions", "stats"],
)

const calls = []
const runner = createCliCommandRunner({
  command: "mimo",
  execFile: async (command, args) => {
    calls.push({ command, args })
    return { stdout: "ok", stderr: "" }
  },
})

assert.deepEqual(await runner.runReadonlyCliCommand("debug-paths"), { command: "mimo", args: ["debug", "paths"], stdout: "ok", stderr: "" })
assert.deepEqual(await runner.runReadonlyCliCommand("debug-config"), { command: "mimo", args: ["debug", "config"], stdout: "ok", stderr: "" })
assert.deepEqual(await runner.runReadonlyCliCommand("mcp"), { command: "mimo", args: ["mcp", "list"], stdout: "ok", stderr: "" })
assert.deepEqual(await runner.runReadonlyCliCommand("agents"), { command: "mimo", args: ["agent", "list"], stdout: "ok", stderr: "" })
assert.deepEqual(await runner.runReadonlyCliCommand("sessions"), { command: "mimo", args: ["session", "list"], stdout: "ok", stderr: "" })
assert.deepEqual(await runner.runReadonlyCliCommand("stats"), { command: "mimo", args: ["stats"], stdout: "ok", stderr: "" })
assert.equal(calls.length, 6)

await assert.rejects(
  () => runner.runReadonlyCliCommand("upgrade"),
  /Unsupported read-only MiMo command/,
)

console.log("cli command tests passed")
