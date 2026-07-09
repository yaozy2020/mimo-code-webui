import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"))
const outDir = path.join(root, "dist-release")
const stage = path.join(outDir, `mimo-code-webui-v${pkg.version}`)
const archive = path.join(outDir, `mimo-code-webui-v${pkg.version}.tar.gz`)

function copy(src, dest = src) {
  fs.cpSync(path.join(root, src), path.join(stage, dest), { recursive: true })
}

fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

for (const required of ["web/dist", "server/dist", "package.json", "package-lock.json", "README.md", "docs/deployment.md", "deploy"]) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing required release input: ${required}`)
}

copy("web/dist")
copy("server/dist")
copy("package.json")
copy("package-lock.json")
copy("server/package.json")
copy("web/package.json")
copy("scripts/start.sh")
copy("scripts/start.bat")
copy("README.md")
if (fs.existsSync(path.join(root, "docs/operations.md"))) copy("docs/operations.md")
if (fs.existsSync(path.join(root, "docs/testing.md"))) copy("docs/testing.md")
copy("docs/deployment.md")
copy("deploy")

fs.rmSync(archive, { force: true })
const result = spawnSync("tar", ["-czf", archive, "-C", outDir, path.basename(stage)], { stdio: "inherit" })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`[release] wrote ${archive}`)
