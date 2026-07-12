import assert from "node:assert/strict"
import http from "node:http"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let received
const server = http.createServer((req, res) => {
  let body = ""
  req.setEncoding("utf8")
  req.on("data", (chunk) => { body += chunk })
  req.on("end", () => {
    received = JSON.parse(body)
    res.writeHead(204).end()
  })
})

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
try {
  const address = server.address()
  const result = await new Promise((resolve) => {
    const child = spawn("bash", ["scripts/send-alert.sh", "mimo-code-webui.service", "failed"], {
      cwd: root,
      env: { ...process.env, MIMO_ALERT_WEBHOOK_URL: `http://127.0.0.1:${address.port}/alert`, AUTH_TOKEN: "must-not-leak" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("close", (status) => resolve({ status, stderr }))
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(received.product, "mimo-code-webui")
  assert.equal(received.unit, "mimo-code-webui.service")
  assert.equal(received.state, "failed")
  assert.equal(JSON.stringify(received).includes("must-not-leak"), false)

  const unconfigured = await new Promise((resolve) => {
    const child = spawn("bash", ["scripts/send-alert.sh", "mimo-code-webui.service", "failed"], {
      cwd: root,
      env: { ...process.env, MIMO_ALERT_WEBHOOK_URL: "" },
      stdio: ["ignore", "ignore", "pipe"],
    })
    child.on("close", resolve)
  })
  assert.equal(unconfigured, 0)
  console.log("alert delivery tests passed")
} finally {
  await new Promise((resolve) => server.close(resolve))
}
