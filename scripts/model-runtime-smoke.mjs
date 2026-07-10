import { exec } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(exec)
const checks = [
  ["5.5", process.env.MODEL_RUNTIME_SMOKE_55],
  ["5.6", process.env.MODEL_RUNTIME_SMOKE_56],
].filter(([, command]) => command)

if (checks.length === 0) {
  console.log("model runtime smoke skipped: set MODEL_RUNTIME_SMOKE_55 and/or MODEL_RUNTIME_SMOKE_56 to command lines that return READY")
  process.exit(0)
}

for (const [label, command] of checks) {
  const { stdout, stderr } = await run(command, { timeout: 120000 })
  const output = `${stdout}\n${stderr}`
  if (!output.includes("READY")) {
    throw new Error(`${label} runtime smoke failed: expected output to contain READY. Output was:\n${output.slice(0, 2000)}`)
  }
  console.log(`${label} runtime smoke passed`)
}
