import assert from "node:assert/strict"
import { todoDisplayText } from "./todoDisplay.ts"

assert.equal(todoDisplayText({ content: "修复开关状态", status: "pending" }), "修复开关状态")
assert.equal(todoDisplayText({ title: "编排多代理工作流", status: "pending" }), "编排多代理工作流")
assert.equal(todoDisplayText({ text: "检查移动端排版", status: "in_progress" }), "检查移动端排版")
assert.equal(todoDisplayText({ status: "pending" }), "未命名任务")

console.log("todo display tests passed")
