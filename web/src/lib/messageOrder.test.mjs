import assert from "node:assert/strict"
import { orderMessages } from "./messageOrder.ts"

const messages = [
  { id: "two", sessionID: "s", role: "assistant", content: "2", time: { created: 2_000 } },
  { id: "three", sessionID: "s", role: "user", content: "3", time: { created: 3_000 } },
  { id: "one", sessionID: "s", role: "user", content: "1", time: { created: 1_000 } },
]

assert.deepEqual(
  orderMessages(messages).map((message) => message.id),
  ["one", "two", "three"],
  "late-arriving older messages should be inserted by created time instead of staying at the bottom",
)

assert.deepEqual(
  orderMessages([...messages, { id: "local", sessionID: "s", role: "assistant", content: "typing" }]).map((message) => message.id),
  ["one", "two", "three", "local"],
  "messages without server time should keep append order after timed messages",
)

console.log("message order tests passed")
