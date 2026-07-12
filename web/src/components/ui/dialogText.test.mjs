import assert from "node:assert/strict"
import fs from "node:fs"

const dialog = fs.readFileSync(new URL("./dialog.tsx", import.meta.url), "utf8")
const button = fs.readFileSync(new URL("./button.tsx", import.meta.url), "utf8")

assert.match(dialog, /bg-background[^\"]*text-foreground/, "dialog content must define a visible foreground color")
assert.match(button, /bg-background text-foreground/, "outline buttons must not rely on inherited text color")
assert.match(button, /text-foreground hover:bg-accent/, "ghost buttons must not rely on inherited text color")

console.log("dialog text visibility tests passed")
