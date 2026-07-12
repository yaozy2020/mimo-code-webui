import assert from "node:assert/strict"
import { sendCommand } from "./message.ts"

globalThis.localStorage = { getItem: () => null }

let request
globalThis.fetch = async (url, options) => {
  request = { url, options }
  return new Response(null, { status: 204 })
}

await sendCommand("ses_test", "init", "补充项目规则", "/tmp/project")

assert.equal(request.url, "/api/session/ses_test/command?directory=%2Ftmp%2Fproject")
assert.equal(request.options.method, "POST")
assert.deepEqual(JSON.parse(request.options.body), {
  command: "init",
  arguments: "补充项目规则",
})

console.log("session command API tests passed")
