import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { getSessionSource } from "./sessionSource.ts"

describe("getSessionSource", () => {
  it("does not label attached sessions in the current workspace as external", () => {
    assert.deepEqual(getSessionSource("ses_web", ["ses_other"], ["ses_web"], "/repo", "/repo/"), {
      external: false,
    })
  })

  it("labels attached sessions from another workspace without claiming they are external", () => {
    assert.deepEqual(getSessionSource("ses_cli", ["ses_web"], ["ses_cli"], "/other", "/repo"), {
      external: true,
      label: "接入会话",
      description: "这个会话是当前浏览器接入的已有会话，可能来自 WebUI、CLI 或其它客户端。",
    })
  })

  it("does not mark WebUI-owned sessions as external", () => {
    assert.deepEqual(getSessionSource("ses_web", ["ses_web"], ["ses_web"]), {
      external: false,
    })
  })
})
