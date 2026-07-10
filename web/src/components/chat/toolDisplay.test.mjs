import assert from "node:assert/strict"
import { toolTaskTitle } from "./toolDisplay.ts"

assert.equal(
  toolTaskTitle({ id: "p", type: "tool", tool: "task", state: { input: { summary: "修复移动端视觉状态" } } }),
  "修复移动端视觉状态",
)
assert.equal(
  toolTaskTitle({ id: "p", type: "tool", tool: "todo", state: { input: { content: "检查排队消息" } } }),
  "检查排队消息",
)
assert.equal(toolTaskTitle({ id: "p", type: "tool", tool: "todo", state: { input: {} } }), "")

console.log("tool display tests passed")
