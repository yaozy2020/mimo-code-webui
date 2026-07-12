import assert from "node:assert/strict"
import fs from "node:fs"

function loadFunction(source, name) {
  const match = source.match(new RegExp(`export function ${name}\\([^]*?\\n}`))
  assert.ok(match, `${name} should be exported`)
  const javascript = match[0]
    .replace("export function", "function")
    .replace(/: (?:string|unknown|AttachmentInput\[\])/g, "")
  return Function(`${javascript}; return ${name}`)()
}

const controller = fs.readFileSync(new URL("./usePromptController.ts", import.meta.url), "utf8")
const fileApi = fs.readFileSync(new URL("../../api/file.ts", import.meta.url), "utf8")
const panel = fs.readFileSync(new URL("../files/FileChangesPanel.tsx", import.meta.url), "utf8")
const store = fs.readFileSync(new URL("../../stores/appStore.tsx", import.meta.url), "utf8")
const buildLocalRunPrompt = loadFunction(controller, "buildLocalRunPrompt")
const shouldFallbackLocalRun = loadFunction(controller, "shouldFallbackLocalRun")

const attachment = { filename: "notes.txt", content: "facts" }
assert.equal(buildLocalRunPrompt("question", [attachment]), "question\n\n[Attachment: notes.txt]\nfacts")
assert.equal(buildLocalRunPrompt("", [attachment]), "[Attachment: notes.txt]\nfacts")
assert.equal((buildLocalRunPrompt("question", [attachment]).match(/facts/g) ?? []).length, 1)
assert.equal(shouldFallbackLocalRun(new Error("network failed")), false)
assert.equal(shouldFallbackLocalRun(Object.assign(new Error("unsupported"), { code: "STREAM_UNSUPPORTED" })), true)
assert.equal(shouldFallbackLocalRun(Object.assign(new Error("incomplete"), { code: "STREAM_INCOMPLETE" })), false)

assert.match(controller, /unsupportedAttachment[\s\S]*当前模型不支持图片或二进制附件/)
assert.match(controller, /localOnly: true/)
assert.match(controller, /localOnly: localRunSelected/)
assert.match(controller, /localAbortRef\.current\.get\(requestKey\) === localAbort/)
assert.match(controller, /REMOVE_EMPTY_ASSISTANT/)
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
