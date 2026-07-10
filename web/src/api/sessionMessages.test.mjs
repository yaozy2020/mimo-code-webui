import assert from "node:assert/strict"
import { collectMessagePages } from "./session.ts"

const pages = new Map([
  [
    undefined,
    [
      { id: "m3", sessionID: "s", role: "assistant", content: "three", time: { created: 3 } },
      { id: "m4", sessionID: "s", role: "user", content: "four", time: { created: 4 } },
    ],
  ],
  [
    "m3",
    [
      { id: "m1", sessionID: "s", role: "user", content: "one", time: { created: 1 } },
      { id: "m2", sessionID: "s", role: "assistant", content: "two", time: { created: 2 } },
    ],
  ],
  ["m1", []],
])

const requestedBefore = []
const messages = await collectMessagePages({
  pageSize: 2,
  maxMessages: 10,
  loadPage: async (before) => {
    requestedBefore.push(before)
    return pages.get(before) ?? []
  },
})

assert.deepEqual(requestedBefore, [undefined, "m3", "m1"])
assert.deepEqual(
  messages.map((message) => message.id),
  ["m1", "m2", "m3", "m4"],
  "older pages should be merged before recent messages by creation time",
)

const partialMessages = await collectMessagePages({
  pageSize: 2,
  maxMessages: 10,
  loadPage: async (before) => {
    if (before) throw new Error('HTTP 400: {"error":[{"message":"Invalid cursor"}]}')
    return [
      { id: "recent-1", sessionID: "s", role: "assistant", content: "recent one", time: { created: 3 } },
      { id: "recent-2", sessionID: "s", role: "user", content: "recent two", time: { created: 4 } },
    ]
  },
})

assert.deepEqual(
  partialMessages.map((message) => message.id),
  ["recent-1", "recent-2"],
  "invalid older-page cursors should keep the messages already loaded",
)

console.log("session message pagination tests passed")
