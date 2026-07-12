const url = process.env.SMOKE_URL || "http://127.0.0.1:8090/"
process.env.PLAYWRIGHT_BROWSERS_PATH ||= ".playwright-browsers"

const { chromium } = await import("@playwright/test")

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const counts = { events: 0, messages: 0, todos: 0, permissions: 0, questions: 0, diffs: 0 }
  let phase = 1
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })

  await page.addInitScript(() => {
    const session = { id: "smoke-session", title: "Reconciliation smoke", directory: "/tmp/smoke", time: { created: 1, updated: 1 } }
    localStorage.setItem("mimo-webui-active-session", session.id)
    localStorage.setItem("mimo-webui-attached-session-ids", JSON.stringify([session.id]))
    localStorage.setItem("mimo-webui-session-cache", JSON.stringify([session]))
    localStorage.setItem("mimo-webui-current-workspace", session.directory)
  })

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url())
    const path = requestUrl.pathname
    if (path === "/api/global/event") {
      counts.events += 1
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
      return
    }
    if (path === "/api/session") return json(route, [{ id: "smoke-session", title: "Reconciliation smoke", directory: "/tmp/smoke", time: { created: 1, updated: 1 } }])
    if (path === "/api/session/smoke-session/message") {
      counts.messages += 1
      return json(route, [
        {
          info: { id: "user-message", sessionID: "smoke-session", role: "user", time: { created: 1 } },
          parts: [{ id: "user-part", type: "text", text: "reconcile" }],
        },
        {
          info: { id: `message-${phase}`, sessionID: "smoke-session", role: "assistant", time: { created: phase + 1 } },
          parts: [{ id: `part-${phase}`, type: "text", text: `authoritative-phase-${phase}` }],
        },
      ])
    }
    if (path === "/api/session/smoke-session/todo") { counts.todos += 1; return json(route, []) }
    if (path === "/api/session/smoke-session/diff") { counts.diffs += 1; return json(route, []) }
    if (path === "/api/permission") { counts.permissions += 1; return json(route, []) }
    if (path === "/api/question") { counts.questions += 1; return json(route, []) }
    if (path === "/status") return json(route, { mimo: { healthy: true }, authRequired: false })
    if (path === "/local-status") return json(route, { mimo: { healthy: true, managed: true, url: "http://127.0.0.1:4096" } })
    if (path.startsWith("/local-config/") || path === "/api/config") return json(route, { models: [], provider: {} })
    await route.continue()
  })

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
  await page.getByText("authoritative-phase-1").waitFor({ timeout: 15000 })
  await page.waitForFunction(() => document.body.innerText.includes("authoritative-phase-1"))
  await page.waitForTimeout(1200)
  if (counts.events < 2) throw new Error(`Expected SSE reconnect after EOF, observed ${counts.events} connection(s)`)
  if (counts.messages < 2 || counts.todos < 2 || counts.permissions < 2 || counts.questions < 2 || counts.diffs < 2) {
    throw new Error(`Reconnect did not reconcile all snapshot resources: ${JSON.stringify(counts)}`)
  }

  phase = 2
  const beforeVisibility = { ...counts }
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await page.getByText("authoritative-phase-2").waitFor({ timeout: 10000 })
  for (const key of ["messages", "todos", "permissions", "questions", "diffs"]) {
    if (counts[key] <= beforeVisibility[key]) throw new Error(`Visibility restore did not refresh ${key}`)
  }
  if (counts.todos > 10) throw new Error(`Unexpected session refresh loop: ${counts.todos} todo requests`)

  console.log(`browser reconciliation smoke passed: ${url} ${JSON.stringify(counts)}`)
} finally {
  await browser.close()
}
