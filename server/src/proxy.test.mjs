import assert from "node:assert/strict"
import { resolveMimoTarget } from "./proxy.ts"

let requested = ""
assert.equal(await resolveMimoTarget({ baseUrl: "http://base", ensureDirectoryServer: async () => ({ url: "unused" }) }), "http://base")
assert.equal(
  await resolveMimoTarget({
    directory: "/workspace/a",
    baseUrl: "http://base",
    ensureDirectoryServer: async (directory) => {
      requested = directory
      return { url: "http://directory" }
    },
  }),
  "http://directory",
)
assert.equal(requested, "/workspace/a")

console.log("proxy routing tests passed")
