import assert from "node:assert/strict"
import fs from "node:fs"

const dialog = fs.readFileSync(new URL("./dialog.tsx", import.meta.url), "utf8")
const button = fs.readFileSync(new URL("./button.tsx", import.meta.url), "utf8")
const permission = fs.readFileSync(new URL("../chat/PermissionDialog.tsx", import.meta.url), "utf8")

assert.match(dialog, /bg-background[^\"]*text-foreground/, "dialog content must define a visible foreground color")
assert.match(button, /bg-background text-foreground/, "outline buttons must not rely on inherited text color")
assert.match(button, /text-foreground hover:bg-accent/, "ghost buttons must not rely on inherited text color")
assert.match(permission, /contentClassName="text-foreground"/, "permission dialog must define its own foreground")
assert.match(permission, /DialogTitle className="text-foreground"/, "permission title must not rely on inherited text color")
assert.match(permission, /bg-muted p-2 text-xs text-foreground/, "permission details must define a visible foreground")
assert.match(permission, /variant="default" className="text-primary-foreground"/, "primary permission action must define its foreground")
assert.match(permission, /variant="secondary" className="text-secondary-foreground"/, "secondary permission action must define its foreground")
assert.equal((permission.match(/variant="outline"[\s\S]{0,80}className="text-foreground"/g) ?? []).length, 2, "outline permission actions must define their foreground")

console.log("dialog text visibility tests passed")
