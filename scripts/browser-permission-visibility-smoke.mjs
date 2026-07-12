const url = process.env.SMOKE_URL || "http://127.0.0.1:8090/"
process.env.PLAYWRIGHT_BROWSERS_PATH ||= ".playwright-browsers"

const { chromium } = await import("@playwright/test")

function luminance([r, g, b]) {
  const values = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function parseRgb(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`)
  return channels
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(parseRgb(foreground)), luminance(parseRgb(background))].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const browser = await chromium.launch({ headless: true })
try {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.addInitScript(({ theme }) => {
      const session = { id: "permission-session", title: "Permission smoke", directory: "/tmp/smoke", time: { created: 1, updated: 1 } }
      localStorage.setItem("mimo-webui-active-session", session.id)
      localStorage.setItem("mimo-webui-attached-session-ids", JSON.stringify([session.id]))
      localStorage.setItem("mimo-webui-session-cache", JSON.stringify([session]))
      localStorage.setItem("mimo-webui-theme", theme)
    }, { theme })

    const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === "/api/global/event") return route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
      if (path === "/api/session") return json(route, [{ id: "permission-session", title: "Permission smoke", directory: "/tmp/smoke", time: { created: 1, updated: 1 } }])
      if (path === "/api/session/permission-session/message" || path === "/api/session/permission-session/todo" || path === "/api/question") return json(route, [])
      if (path === "/api/permission") return json(route, [{ id: "permission-smoke", sessionID: "permission-session", toolName: "write", description: "允许写入测试文件", input: { path: "/tmp/smoke.txt" }, agent: "build" }])
      if (path === "/status") return json(route, { mimo: { healthy: true }, authRequired: false })
      if (path === "/local-status") return json(route, { mimo: { healthy: true, managed: true } })
      if (path.startsWith("/local-config/") || path === "/api/config") return json(route, { models: [], provider: {} })
      return route.continue()
    })

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
    const dialog = page.getByText("代理权限请求").locator("..")
    await dialog.waitFor({ timeout: 15000 })
    const elements = [
      page.getByText("代理权限请求"),
      page.getByText("允许写入测试文件"),
      page.getByRole("button", { name: "1. 允许一次" }),
      page.getByRole("button", { name: "2. 本会话允许" }),
      page.getByRole("button", { name: "3. 拒绝" }),
      page.getByRole("button", { name: "4. 反馈" }),
    ]
    for (const element of elements) {
      const colors = await element.evaluate((node) => {
        const style = getComputedStyle(node)
        let background = style.backgroundColor
        let parent = node.parentElement
        while ((background === "transparent" || background.endsWith(", 0)")) && parent) {
          background = getComputedStyle(parent).backgroundColor
          parent = parent.parentElement
        }
        return { text: node.textContent?.trim(), foreground: style.color, background }
      })
      if (contrast(colors.foreground, colors.background) < 4.5) {
        throw new Error(`${theme} permission text is not visible: ${JSON.stringify(colors)}`)
      }
    }
    await page.close()
  }
  console.log(`permission dialog visibility smoke passed: ${url}`)
} finally {
  await browser.close()
}
