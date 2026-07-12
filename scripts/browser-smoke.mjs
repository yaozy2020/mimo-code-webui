const url = process.env.SMOKE_URL || "http://127.0.0.1:8090/"
process.env.PLAYWRIGHT_BROWSERS_PATH ||= ".playwright-browsers"

const { chromium } = await import("@playwright/test")

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  if (process.env.SMOKE_AUTH_TOKEN) {
    const login = await page.request.post(new URL("/login", url).toString(), {
      data: { token: process.env.SMOKE_AUTH_TOKEN },
    })
    if (!login.ok()) throw new Error(`Smoke login failed with HTTP ${login.status()}`)
  }
  const consoleErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
  const bodyText = await page.locator("body").innerText({ timeout: 15000 })
  if (!bodyText.includes("MiMo Code")) {
    throw new Error(`Expected page body to include "MiMo Code". Body was: ${bodyText.slice(0, 500)}`)
  }
  const hasStartScreen = bodyText.includes("选择工作区开始")
  const hasChatShell = bodyText.includes("输入指令") || bodyText.includes("MiMo Code")
  const hasAuthPrompt = bodyText.includes("需要认证")
  if (!hasStartScreen && !hasChatShell && !hasAuthPrompt) {
    throw new Error(`Expected app shell, start screen, or auth prompt. Body was: ${bodyText.slice(0, 500)}`)
  }
  if (process.env.SMOKE_SESSION_ID) {
    console.warn("SMOKE_SESSION_ID is set, but this app has no URL-addressable session route yet; skipping long-history browser assertion.")
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Browser console errors:\n${consoleErrors.slice(0, 5).join("\n")}`)
  }
  console.log(`browser smoke passed: ${url}`)
} finally {
  await browser.close()
}
