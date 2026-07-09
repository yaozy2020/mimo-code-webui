import { mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"

const url = process.env.SMOKE_URL || "http://127.0.0.1:8090/"
const home = process.env.CHROMIUM_SMOKE_HOME || ".chromium-smoke-home"

mkdirSync(home, { recursive: true })

const result = spawnSync(
  process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${home}/profile`,
    "--dump-dom",
    url,
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: `${home}/.config`,
      XDG_CACHE_HOME: `${home}/.cache`,
    },
  },
)

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

if (!result.stdout.includes("MiMo Code")) {
  throw new Error(`Expected page DOM to include "MiMo Code". DOM was: ${result.stdout.slice(0, 500)}`)
}

console.log(`system chromium smoke passed: ${url}`)
