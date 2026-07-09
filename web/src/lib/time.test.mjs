import assert from "node:assert/strict"
import { formatActivityTime, formatMessageTime } from "./time.ts"

const timestamp = new Date("2026-07-09T08:05:00Z").getTime()

assert.match(formatActivityTime(timestamp), /7月9日|7月 9日|07月09日/, "activity time should include month and day")
assert.match(formatActivityTime(timestamp), /08:05|16:05/, "activity time should include hour and minute")
assert.equal(formatActivityTime(undefined), "暂无活动")
assert.match(formatMessageTime(timestamp), /08:05|16:05/, "message time should include hour and minute")
assert.equal(formatMessageTime(undefined), "")

console.log("time formatting tests passed")
