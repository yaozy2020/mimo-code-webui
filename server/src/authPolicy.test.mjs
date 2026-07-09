import assert from "node:assert/strict"
import { assertSafeAuthPolicy } from "./authPolicy.ts"

assert.doesNotThrow(() => assertSafeAuthPolicy({ host: "127.0.0.1" }))
assert.doesNotThrow(() => assertSafeAuthPolicy({ host: "localhost" }))
assert.doesNotThrow(() => assertSafeAuthPolicy({ host: "0.0.0.0", authToken: "secret" }))
assert.doesNotThrow(() => assertSafeAuthPolicy({ host: "0.0.0.0", allowUnauthenticatedLan: true }))
assert.throws(
  () => assertSafeAuthPolicy({ host: "0.0.0.0" }),
  /AUTH_TOKEN is required/i,
  "non-loopback hosts should require auth by default",
)

console.log("auth policy tests passed")
