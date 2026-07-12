import assert from "node:assert/strict"
import { getSlashCommandMatches, parseSlashCommand } from "./slashCommands.ts"

assert.deepEqual(
  parseSlashCommand("/init 补充项目规则"),
  { handled: true, type: "command", command: "init", arguments: "补充项目规则" },
  "/init should execute the native MiMo command",
)

assert.deepEqual(
  parseSlashCommand("/review"),
  { handled: true, type: "command", command: "review", arguments: "" },
  "/review should execute the native MiMo command",
)

assert.ok(
  getSlashCommandMatches("/di").some((command) => command.name === "/distill"),
  "partial slash input should match a native command",
)

assert.deepEqual(parseSlashCommand("普通输入"), { handled: false }, "normal input should remain a prompt")

assert.deepEqual(
  parseSlashCommand("/models"),
  { handled: true, type: "action", action: "models" },
  "/models should execute a WebUI action",
)

assert.deepEqual(
  parseSlashCommand("/resume"),
  { handled: true, type: "action", action: "sessions" },
  "/resume should alias the sessions action",
)

assert.deepEqual(
  parseSlashCommand("/compact"),
  { handled: false, error: "不支持的命令：/compact" },
  "unsupported built-ins must not be converted into prompts",
)

assert.deepEqual(
  parseSlashCommand("/fix 修复登录失败"),
  { handled: false, error: "不支持的命令：/fix" },
  "legacy prompt templates must not be sent as prompts",
)

console.log("slash command tests passed")
