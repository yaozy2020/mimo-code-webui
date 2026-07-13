import assert from "node:assert/strict"
import { getStreamRevision, isCurrentStreamRevision, recordStreamEvent } from "./streamRevision.ts"

const initial = getStreamRevision()
assert.equal(isCurrentStreamRevision(initial), true, "a snapshot should apply before a newer event")
recordStreamEvent()
assert.equal(isCurrentStreamRevision(initial), false, "a snapshot must not overwrite a newer stream event")

console.log("stream revision tests passed")
