import assert from "node:assert/strict"
import { appendMessageContent, findMessageReconciliationIndex, mergeMessagePartsWithVisibleAttachments, setMessageContent } from "./appReducers.ts"

const sessionID = "s1"
const initial = { [sessionID]: [{ id: "m1", sessionID, role: "assistant", content: "hel", time: { created: 1 } }] }

assert.equal(appendMessageContent(initial, sessionID, "m1", "lo")[sessionID][0].content, "hello")
assert.equal(setMessageContent(initial, sessionID, "m1", "done")[sessionID][0].content, "done")
assert.equal(setMessageContent(initial, sessionID, "m1", "he")[sessionID][0].content, "hel")
assert.equal(appendMessageContent({}, sessionID, "m2", "new")[sessionID][0].content, "new")

const serverTextPart = { id: "srv-text", type: "text", content: "看这个" }
const localImagePart = { id: "local-image", type: "file", mime: "image/png", filename: "shot.png", url: "data:image/png;base64,abc" }
assert.deepEqual(mergeMessagePartsWithVisibleAttachments([serverTextPart], [serverTextPart, localImagePart]), [serverTextPart, localImagePart])

const repeatedServerMessages = [
  { id: "server-1", sessionID, role: "user", content: "same text" },
]
assert.equal(findMessageReconciliationIndex(repeatedServerMessages, { id: "server-2", sessionID, role: "user", content: "same text" }), -1)
assert.equal(findMessageReconciliationIndex(repeatedServerMessages, { id: "server-1", sessionID, role: "user", content: "changed" }), 0)
assert.equal(findMessageReconciliationIndex([{ ...repeatedServerMessages[0], optimistic: true }], { id: "server-2", sessionID, role: "user", content: "same text" }), -1)

console.log("app reducer tests passed")
