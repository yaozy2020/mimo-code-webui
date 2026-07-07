import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { getSessionSource } from "./sessionSource.ts"

describe("getSessionSource", () => {
  it("marks attached sessions that are not owned as external", () => {
    assert.deepEqual(getSessionSource("ses_cli", ["ses_web"], ["ses_cli"]), {
      external: true,
      label: "外部会话",
      description: "会同步 CLI 或其它客户端写入的消息；普通聊天/流式测试建议新建工作区会话。",
    })
  })

  it("does not mark WebUI-owned sessions as external", () => {
    assert.deepEqual(getSessionSource("ses_web", ["ses_web"], ["ses_web"]), {
      external: false,
    })
  })
})
