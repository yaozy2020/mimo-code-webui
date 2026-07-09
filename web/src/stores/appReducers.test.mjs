import assert from "node:assert/strict"
import { appendMessageContent, setMessageContent } from "./appReducers.ts"

const sessionID = "s1"
const initial = { [sessionID]: [{ id: "m1", sessionID, role: "assistant", content: "hel", time: { created: 1 } }] }

assert.equal(appendMessageContent(initial, sessionID, "m1", "lo")[sessionID][0].content, "hello")
assert.equal(setMessageContent(initial, sessionID, "m1", "done")[sessionID][0].content, "done")
assert.equal(setMessageContent(initial, sessionID, "m1", "he")[sessionID][0].content, "hel")
assert.equal(appendMessageContent({}, sessionID, "m2", "new")[sessionID][0].content, "new")

console.log("app reducer tests passed")
