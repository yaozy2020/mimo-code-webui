import assert from "node:assert/strict"
import { switchThumbClassName, switchTrackClassName } from "./switchStyles.ts"

assert.match(switchTrackClassName, /has-\[:checked\]:bg-primary/, "checked switch should visibly change track color")
assert.match(switchTrackClassName, /has-\[:checked\]:border-primary/, "checked switch should visibly change track border")
assert.match(switchThumbClassName, /peer-checked:bg-primary-foreground/, "checked switch thumb should contrast against active track")

console.log("switch visual state tests passed")
