const url = process.env.SMOKE_URL || "http://127.0.0.1:8090/"
process.env.PLAYWRIGHT_BROWSERS_PATH ||= ".playwright-browsers"

const { chromium } = await import("@playwright/test")

function session() {
  return { id: "smoke-session", title: "Cancellation smoke", directory: "/tmp/smoke", time: { created: 1, updated: 1 } }
}

async function preparePage(browser, native) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const calls = { abort: 0, fallback: 0, stream: 0 }
  await page.addInitScript((cachedSession) => {
    localStorage.setItem("mimo-webui-active-session", cachedSession.id)
    localStorage.setItem("mimo-webui-attached-session-ids", JSON.stringify([cachedSession.id]))
    localStorage.setItem("mimo-webui-session-cache", JSON.stringify([cachedSession]))
    localStorage.setItem("mimo-webui-current-workspace", cachedSession.directory)
    localStorage.setItem("mimo-webui-model", "smoke/model")
  }, session())
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  await page.route("**/*", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/api/global/event") return route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
    if (path === "/api/session") return json(route, [session()])
    if (path === "/api/session/smoke-session/message" || path === "/api/session/smoke-session/todo" || path === "/api/permission" || path === "/api/question") return json(route, [])
    if (path === "/api/config") return json(route, { provider: native ? { smoke: { models: { model: {} } } } : {} })
    if (path === "/api/session/smoke-session/prompt_async") return json(route, {})
    if (path === "/api/session/smoke-session/abort") { calls.abort += 1; return json(route, {}) }
    if (path === "/local-run/stream") {
      calls.stream += 1
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "data: {\"type\":\"done\"}\n\n" }).catch(() => undefined)
      return
    }
    if (path === "/local-run") { calls.fallback += 1; return json(route, { text: "unexpected fallback" }) }
    if (path === "/status") return json(route, { mimo: { healthy: true }, authRequired: false })
    if (path === "/local-status") return json(route, { mimo: { healthy: true, managed: true } })
    if (path.startsWith("/local-config/")) return json(route, { models: [] })
    await route.continue()
  })
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
  await page.getByPlaceholder(/输入指令/).fill("cancel smoke")
  await page.getByRole("button", { name: "发送消息" }).click()
  await page.getByRole("button", { name: "停止生成" }).waitFor({ timeout: 10000 })
  await page.getByRole("button", { name: "停止生成" }).click()
  return { page, calls }
}

const browser = await chromium.launch({ headless: true })
try {
  const native = await preparePage(browser, true)
  await native.page.waitForFunction(() => true)
  if (native.calls.abort !== 1) throw new Error(`Native cancellation called abort ${native.calls.abort} time(s)`)
  await native.page.close()

  const local = await preparePage(browser, false)
  await local.page.waitForTimeout(250)
  if (local.calls.stream !== 1) throw new Error(`Expected one local stream, observed ${local.calls.stream}`)
  if (local.calls.fallback !== 0) throw new Error(`Local abort triggered ${local.calls.fallback} fallback request(s)`)
  if (local.calls.abort !== 0) throw new Error(`Local abort incorrectly called native abort ${local.calls.abort} time(s)`)
  await local.page.close()
  console.log(`browser cancellation smoke passed: ${url}`)
} finally {
  await browser.close()
}
