import assert from "node:assert/strict"
import fs from "node:fs"

const controller = fs.readFileSync(new URL("./usePromptController.ts", import.meta.url), "utf8")
const sessionData = fs.readFileSync(new URL("./useActiveSessionData.ts", import.meta.url), "utf8")
const stream = fs.readFileSync(new URL("../../hooks/useStreamingMessage.ts", import.meta.url), "utf8")

assert.match(controller, /let nativePromptAccepted = false/, "native prompts must track server acceptance separately from request completion")
assert.match(controller, /nativePromptAccepted = true/, "a successful prompt_async request must remain active until a session event ends it")
assert.match(controller, /if \(nativePromptPending\) return/, "uncertain native prompt delivery must preserve the optimistic message for reconciliation")
assert.match(controller, /localRunSelected \|\| \(!nativePromptAccepted && !nativePromptUncertain\)/, "only local or definitively rejected prompts may force idle")
assert.match(sessionData, /listPermissions\(activeDirectory\)/, "periodic recovery must refresh pending permissions")
assert.match(sessionData, /listQuestions\(activeDirectory\)/, "periodic recovery must refresh pending questions")
assert.doesNotMatch(sessionData, /getMessages\(activeSessionID, 50/, "periodic recovery must not truncate long session history")
assert.match(sessionData, /getRecentMessages\(activeSessionID, activeDirectory\)/, "periodic recovery must use the paginated message snapshot")
assert.match(sessionData, /isCurrentStreamRevision\(revision\)/, "periodic recovery must reject stale snapshots")
assert.match(sessionData, /const \[todos, permissions, questions, msgs\] = await Promise\.all/, "periodic recovery must validate one coherent snapshot")
assert.match(stream, /recordStreamEvent\(\)/, "every stream event must invalidate in-flight snapshots")
assert.match(stream, /!isCurrentStreamRevision\(revision\)/, "reconnect and idle snapshots must reject stale results")

console.log("prompt recovery tests passed")
