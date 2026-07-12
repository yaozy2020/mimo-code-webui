import assert from "node:assert/strict"
import { parseSSEBuffer } from "./sseParser.ts"

assert.deepEqual(parseSSEBuffer("data: one\r\n\r\ndata: two\n\n"), { data: ["one", "two"], rest: "" })
assert.deepEqual(parseSSEBuffer("event: message\ndata: {\"a\":\ndata: 1}\n\n"), { data: ['{"a":\n1}'], rest: "" })
assert.deepEqual(parseSSEBuffer("data: tail", true), { data: ["tail"], rest: "" })
assert.deepEqual(parseSSEBuffer("data: par"), { data: [], rest: "data: par" })
const splitCR = parseSSEBuffer("data: {\"a\":\r")
assert.deepEqual(splitCR, { data: [], rest: "data: {\"a\":\r" })
assert.deepEqual(parseSSEBuffer(`${splitCR.rest}\ndata: 1}\r\n\r\n`), { data: ['{"a":\n1}'], rest: "" })

console.log("SSE parser tests passed")
