import assert from "node:assert/strict"
import fs from "node:fs"

const controller = fs.readFileSync(new URL("./usePromptController.ts", import.meta.url), "utf8")
const fileApi = fs.readFileSync(new URL("../../api/file.ts", import.meta.url), "utf8")
const panel = fs.readFileSync(new URL("../files/FileChangesPanel.tsx", import.meta.url), "utf8")
const store = fs.readFileSync(new URL("../../stores/appStore.tsx", import.meta.url), "utf8")

assert.match(controller, /unsupportedAttachment[\s\S]*当前模型不支持图片或二进制附件/)
assert.match(controller, /localOnly: true/)
assert.match(controller, /localOnly: localRunSelected/)
assert.match(controller, /localAbortRef\.current\.get\(requestKey\) === localAbort/)
assert.match(store, /message\.optimistic \|\| message\.localOnly/)
assert.match(store, /LOCAL_MESSAGE_CACHE_KEY/)
assert.match(store, /Object\.entries\(messages\)\.slice\(-20\)/)
assert.match(store, /MAX_LOCAL_MESSAGE_CACHE_BYTES/)
assert.match(store, /sessionStorage\.setItem/)
assert.doesNotMatch(store.slice(store.indexOf("function setCachedLocalMessages"), store.indexOf("type AppAction")), /parts:/)
assert.match(fileApi, /query\.set\("directory", directory\)/)
assert.match(panel, /readFileContent\(selectedFile, directory\)/)
assert.match(panel, /setSelectedFile\(diffs\[0\]\?\.file \?\? ""\)/)

console.log("local-run persistence and workspace file safety tests passed")
