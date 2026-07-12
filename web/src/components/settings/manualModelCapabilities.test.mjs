import assert from "node:assert/strict"
import fs from "node:fs"

const settings = fs.readFileSync(new URL("./SettingsPanel.tsx", import.meta.url), "utf8")
const client = fs.readFileSync(new URL("../../api/client.ts", import.meta.url), "utf8")

assert.match(settings, /image_input: true/, "manual models should default to image input support")
assert.match(settings, />图片输入</, "settings must expose image input capability")
assert.match(settings, /image_input: e\.target\.checked/, "image input toggle must update the model payload")
assert.match(client, /image_input\?: boolean/, "manual model API must include image input capability")
assert.match(client, /body: JSON\.stringify\(input\)/, "manual model capabilities must be sent to the backend")

console.log("manual model capability settings tests passed")
