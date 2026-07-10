import assert from "node:assert/strict"
import { codeBlockClassName, codeBlockText, inlineCodeClassName } from "./codeDisplay.ts"

const longPath = inlineCodeClassName("web/src/components/chat/todoDisplay.test.mjs")
assert.match(longPath, /inline-block/)
assert.match(longPath, /max-w-full/)
assert.match(longPath, /overflow-x-auto/)
assert.match(longPath, /whitespace-nowrap/)

const command = inlineCodeClassName("node --import tsx")
assert.match(command, /whitespace-nowrap/)

const shortCode = inlineCodeClassName("verify")
assert.doesNotMatch(shortCode, /overflow-x-auto/)

const markdownCodeElement = {
  props: {
    children: ["sudo install -m 755 ", "/tmp/mimo/mimo", " /usr/local/bin/mimo\n"],
  },
}

assert.equal(
  codeBlockText(markdownCodeElement),
  "sudo install -m 755 /tmp/mimo/mimo /usr/local/bin/mimo\n",
  "code block copy text should include the nested markdown code contents",
)

assert.match(codeBlockClassName(), /inline-block/)
assert.match(codeBlockClassName(), /min-w-max/)
assert.doesNotMatch(codeBlockClassName(), /min-w-0/)

console.log("code display tests passed")
