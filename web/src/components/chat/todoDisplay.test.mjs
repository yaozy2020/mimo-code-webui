import assert from "node:assert/strict"
import { isTodoDone, isTodoRunning, todoDisplayText } from "./todoDisplay.ts"

assert.equal(todoDisplayText({ content: "修复开关状态", status: "pending" }), "修复开关状态")
assert.equal(todoDisplayText({ title: "编排多代理工作流", status: "pending" }), "编排多代理工作流")
assert.equal(todoDisplayText({ text: "检查移动端排版", status: "in_progress" }), "检查移动端排版")
assert.equal(todoDisplayText({ status: "pending" }), "未命名任务")

assert.equal(isTodoRunning({ content: "运行中", status: "in_progress" }), true)
assert.equal(isTodoRunning({ content: "运行中", status: "running" }), true)
assert.equal(isTodoRunning({ content: "运行中", status: "busy" }), true)
assert.equal(isTodoRunning({ content: "排队中", status: "pending" }), false)
assert.equal(isTodoRunning({ content: "取消", status: "cancelled" }), false)
assert.equal(isTodoDone({ content: "完成", status: "done" }), true)
assert.equal(isTodoDone({ content: "完成", status: "success" }), true)

console.log("todo display tests passed")
