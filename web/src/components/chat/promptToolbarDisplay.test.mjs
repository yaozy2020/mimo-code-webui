import assert from "node:assert/strict"
import fs from "node:fs"
import { promptToolbarDiffRowClassName, promptToolbarRowClassName } from "./promptToolbarDisplay.ts"

assert.match(promptToolbarRowClassName, /flex-wrap/, "toolbar badges should wrap instead of scrolling horizontally on mobile")
assert.doesNotMatch(promptToolbarRowClassName, /overflow-x-auto/, "toolbar badges should not create a mobile horizontal scroll strip")

assert.match(promptToolbarDiffRowClassName, /flex-wrap/, "changed-file chips should wrap instead of scrolling horizontally on mobile")
assert.doesNotMatch(promptToolbarDiffRowClassName, /overflow-x-auto/, "changed-file chips should not create a second horizontal scroll strip")

const panel = fs.readFileSync(new URL("./PromptToolbar.tsx", import.meta.url), "utf8")
assert.match(panel, /const \[fileDetailsExpanded, setFileDetailsExpanded\] = useState\(false\)/, "mobile file details should start collapsed")
assert.match(panel, /aria-controls="mobile-file-details"/, "mobile file details should have an accessible disclosure control")
assert.match(panel, /\$\{fileDetailsExpanded \? "flex" : "hidden"\} sm:flex/, "file details should stay expanded on desktop while requiring disclosure on mobile")

console.log("prompt toolbar display tests passed")
