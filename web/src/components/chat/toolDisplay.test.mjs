import assert from "node:assert/strict"
import { isToolDone, isToolRunning, toolTaskTitle } from "./toolDisplay.ts"

assert.equal(
  toolTaskTitle({ id: "p", type: "tool", tool: "task", state: { input: { summary: "修复移动端视觉状态" } } }),
  "修复移动端视觉状态",
)
assert.equal(
  toolTaskTitle({ id: "p", type: "tool", tool: "todo", state: { input: { content: "检查排队消息" } } }),
  "检查排队消息",
)
assert.equal(toolTaskTitle({ id: "p", type: "tool", tool: "todo", state: { input: {} } }), "")

assert.equal(isToolRunning("pending"), true)
assert.equal(isToolRunning("running"), true)
assert.equal(isToolRunning("in_progress"), true)
assert.equal(isToolRunning("busy"), true)
assert.equal(isToolRunning("failed"), false)
assert.equal(isToolDone("completed"), true)
assert.equal(isToolDone("success"), true)
assert.equal(isToolDone("done"), true)

console.log("tool display tests passed")
