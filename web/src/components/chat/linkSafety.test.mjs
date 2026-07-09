import assert from "node:assert/strict"
import { getSafeExternalHref } from "./linkSafety.ts"

assert.equal(getSafeExternalHref("https://example.com/docs"), "https://example.com/docs")
assert.equal(getSafeExternalHref("http://example.com/docs"), "http://example.com/docs")
assert.equal(getSafeExternalHref("mailto:test@example.com"), "mailto:test@example.com")

assert.equal(getSafeExternalHref("docs/deployment.md"), null)
assert.equal(getSafeExternalHref("/opt/mimo-code-webui/current"), null)
assert.equal(getSafeExternalHref("data:image/png;base64,abc"), null)
assert.equal(getSafeExternalHref("javascript:alert(1)"), null)
assert.equal(getSafeExternalHref(undefined), null)

console.log("link safety tests passed")
