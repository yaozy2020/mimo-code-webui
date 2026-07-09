import assert from "node:assert/strict"
import { expandSlashCommand, getSlashCommandMatches } from "./slashCommands.ts"

assert.deepEqual(
  expandSlashCommand("/fix 修复登录失败"),
  { handled: true, type: "prompt", mode: "build", text: "修复这个问题：修复登录失败" },
  "/fix should expand to a build prompt",
)

const review = expandSlashCommand("/review")
assert.equal(review.handled, true)
assert.equal(review.type, "prompt")
assert.equal(review.mode, "plan")
assert.match(review.text, /代码审查/)

assert.ok(
  getSlashCommandMatches("/te").some((command) => command.name === "/test"),
  "partial slash input should match /test",
)

assert.deepEqual(
  expandSlashCommand("普通输入"),
  { handled: false, mode: undefined, text: "普通输入" },
  "normal input should pass through unchanged",
)

assert.deepEqual(
  expandSlashCommand("/models"),
  { handled: true, type: "action", action: "models", text: "" },
  "/models should execute a WebUI model action",
)

assert.deepEqual(
  expandSlashCommand("/resume"),
  { handled: true, type: "action", action: "sessions", text: "" },
  "/resume should alias the sessions action",
)

const compact = expandSlashCommand("/compact 保留当前目标和未完成任务")
assert.equal(compact.handled, true)
assert.equal(compact.type, "prompt")
assert.equal(compact.mode, "plan")
assert.match(compact.text, /总结并压缩当前会话上下文/)
assert.match(compact.text, /保留当前目标和未完成任务/)

const summarize = expandSlashCommand("/summarize")
assert.equal(summarize.handled, true)
assert.equal(summarize.type, "prompt")
assert.equal(summarize.mode, "plan")
assert.match(summarize.text, /总结并压缩当前会话上下文/)

assert.ok(
  getSlashCommandMatches("/con").some((command) => command.name === "/continue"),
  "partial slash input should match /continue",
)

console.log("slash command tests passed")
