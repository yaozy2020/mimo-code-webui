import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export const readonlyCliCommands = {
  "debug-paths": { args: ["debug", "paths"], label: "Debug paths" },
  "debug-config": { args: ["debug", "config"], label: "Debug config" },
  mcp: { args: ["mcp", "list"], label: "MCP servers" },
  agents: { args: ["agent", "list"], label: "Agents" },
  sessions: { args: ["session", "list"], label: "Sessions" },
  stats: { args: ["stats"], label: "Stats" },
} as const

export type ReadonlyCliCommandID = keyof typeof readonlyCliCommands

interface ExecResult {
  stdout: string
  stderr: string
}

interface CliCommandRunnerOptions {
  command: string
  execFile?: (command: string, args: string[], options: { timeout: number; maxBuffer: number }) => Promise<ExecResult>
}

const MAX_OUTPUT_BYTES = 256 * 1024
const COMMAND_TIMEOUT_MS = 15_000

export function createCliCommandRunner(options: CliCommandRunnerOptions) {
  const execFile = options.execFile ?? (async (command, args, execOptions) => {
    const result = await execFileAsync(command, args, execOptions)
    return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") }
  })

  async function runReadonlyCliCommand(id: string) {
    const spec = readonlyCliCommands[id as ReadonlyCliCommandID]
    if (!spec) throw new Error(`Unsupported read-only MiMo command: ${id}`)
    const result = await execFile(options.command, [...spec.args], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES })
    return { command: options.command, args: [...spec.args], stdout: result.stdout, stderr: result.stderr }
  }

  return { runReadonlyCliCommand }
}
