import assert from "node:assert/strict"
import { getVisibleAttachments } from "./messageAttachments.ts"

const imagePart = {
  id: "p1",
  type: "file",
  mime: "image/png",
  filename: "screenshot.png",
  url: "data:image/png;base64,abc",
}

assert.deepEqual(getVisibleAttachments({ id: "m1", sessionID: "s1", role: "user", parts: [imagePart] }), [imagePart])

console.log("message attachment tests passed")
