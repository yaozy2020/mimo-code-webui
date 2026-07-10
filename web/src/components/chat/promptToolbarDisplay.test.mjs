import assert from "node:assert/strict"
import { promptToolbarDiffRowClassName, promptToolbarRowClassName } from "./promptToolbarDisplay.ts"

assert.match(promptToolbarRowClassName, /flex-wrap/, "toolbar badges should wrap instead of scrolling horizontally on mobile")
assert.doesNotMatch(promptToolbarRowClassName, /overflow-x-auto/, "toolbar badges should not create a mobile horizontal scroll strip")

assert.match(promptToolbarDiffRowClassName, /flex-wrap/, "changed-file chips should wrap instead of scrolling horizontally on mobile")
assert.doesNotMatch(promptToolbarDiffRowClassName, /overflow-x-auto/, "changed-file chips should not create a second horizontal scroll strip")

console.log("prompt toolbar display tests passed")
