import assert from "node:assert/strict"
import { appendMessageContent, findMessageReconciliationIndex, mergeMessagePartsWithVisibleAttachments, removeEmptyAssistantMessage, removeOptimisticMessage, setMessageContent } from "./appReducers.ts"

const sessionID = "s1"
const initial = { [sessionID]: [{ id: "m1", sessionID, role: "assistant", content: "hel", time: { created: 1 } }] }

assert.equal(appendMessageContent(initial, sessionID, "m1", "lo")[sessionID][0].content, "hello")
assert.equal(setMessageContent(initial, sessionID, "m1", "done")[sessionID][0].content, "done")
assert.equal(setMessageContent(initial, sessionID, "m1", "he")[sessionID][0].content, "hel")
assert.equal(appendMessageContent({}, sessionID, "m2", "new")[sessionID][0].content, "new")

const serverTextPart = { id: "srv-text", type: "text", content: "看这个" }
const localImagePart = { id: "local-image", type: "file", mime: "image/png", filename: "shot.png", url: "data:image/png;base64,abc" }
assert.deepEqual(mergeMessagePartsWithVisibleAttachments([serverTextPart], [serverTextPart, localImagePart]), [serverTextPart, localImagePart])

const serverImagePart = { ...localImagePart, id: "server-image" }
assert.deepEqual(
  mergeMessagePartsWithVisibleAttachments([serverTextPart, serverImagePart], [serverTextPart, localImagePart]),
  [serverTextPart, serverImagePart],
  "server and optimistic copies of the same attachment should reconcile by content",
)

const repeatedServerMessages = [
  { id: "server-1", sessionID, role: "user", content: "same text" },
]
assert.equal(findMessageReconciliationIndex(repeatedServerMessages, { id: "server-2", sessionID, role: "user", content: "same text" }), -1)
assert.equal(findMessageReconciliationIndex(repeatedServerMessages, { id: "server-1", sessionID, role: "user", content: "changed" }), 0)
assert.equal(findMessageReconciliationIndex([{ ...repeatedServerMessages[0], optimistic: true }], { id: "server-2", sessionID, role: "user", content: "same text" }), -1)

const optimistic = { id: "optimistic-1", sessionID, role: "user", content: "pending", optimistic: true }
const confirmed = { id: "confirmed-1", sessionID, role: "user", content: "sent" }
assert.deepEqual(removeOptimisticMessage({ [sessionID]: [optimistic, confirmed] }, sessionID, optimistic.id)[sessionID], [confirmed])
assert.deepEqual(removeOptimisticMessage({ [sessionID]: [confirmed] }, sessionID, confirmed.id)[sessionID], [confirmed])

const emptyAssistant = { id: "assistant-empty", sessionID, role: "assistant", content: "", localOnly: true }
const populatedAssistant = { ...emptyAssistant, id: "assistant-populated", content: "partial" }
assert.deepEqual(removeEmptyAssistantMessage({ [sessionID]: [emptyAssistant, populatedAssistant] }, sessionID, emptyAssistant.id)[sessionID], [populatedAssistant])
assert.deepEqual(removeEmptyAssistantMessage({ [sessionID]: [populatedAssistant] }, sessionID, populatedAssistant.id)[sessionID], [populatedAssistant])

console.log("app reducer tests passed")
