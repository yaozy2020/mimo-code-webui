import assert from "node:assert/strict"
import { visibleSessionIDsAfterLoad } from "./sessionVisibility.ts"

assert.deepEqual(
  [...visibleSessionIDsAfterLoad({
    sessions: [{ id: "s1" }, { id: "s2" }],
    ownedSessionIDs: [],
    attachedSessionIDs: [],
  })],
  ["s1", "s2"],
  "refresh should recover visible sessions when local visibility index is empty",
)

assert.deepEqual(
  [...visibleSessionIDsAfterLoad({
    sessions: [{ id: "s1" }, { id: "s2" }],
    ownedSessionIDs: ["s1"],
    attachedSessionIDs: [],
  })],
  ["s1"],
  "existing local visibility choices should be preserved",
)

assert.deepEqual(
  [...visibleSessionIDsAfterLoad({
    sessions: [{ id: "s1" }, { id: "s2" }],
    ownedSessionIDs: ["missing"],
    attachedSessionIDs: [],
  })],
  ["s1", "s2"],
  "stale local visibility ids should recover from server sessions when none still exist",
)

console.log("session visibility tests passed")
