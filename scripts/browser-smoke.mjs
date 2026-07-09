const url = process.env.SMOKE_URL || "http://127.0.0.1:8090/"
process.env.PLAYWRIGHT_BROWSERS_PATH ||= ".playwright-browsers"

const { chromium } = await import("@playwright/test")

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
  const bodyText = await page.locator("body").innerText({ timeout: 15000 })
  if (!bodyText.includes("MiMo Code")) {
    throw new Error(`Expected page body to include "MiMo Code". Body was: ${bodyText.slice(0, 500)}`)
  }
  console.log(`browser smoke passed: ${url}`)
} finally {
  await browser.close()
}
