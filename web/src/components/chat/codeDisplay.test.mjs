import assert from "node:assert/strict"
import { inlineCodeClassName } from "./codeDisplay.ts"

const longPath = inlineCodeClassName("web/src/components/chat/todoDisplay.test.mjs")
assert.match(longPath, /inline-block/)
assert.match(longPath, /max-w-full/)
assert.match(longPath, /overflow-x-auto/)
assert.match(longPath, /whitespace-nowrap/)

const command = inlineCodeClassName("node --import tsx")
assert.match(command, /whitespace-nowrap/)

const shortCode = inlineCodeClassName("verify")
assert.doesNotMatch(shortCode, /overflow-x-auto/)

console.log("code display tests passed")
