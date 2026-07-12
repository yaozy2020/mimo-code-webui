import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"))
const outDir = path.join(root, "dist-release")
const stage = path.join(outDir, `mimo-code-webui-v${pkg.version}`)
const archive = path.join(outDir, `mimo-code-webui-v${pkg.version}.tar.gz`)
const checksum = `${archive}.sha256`

function command(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf-8", ...options })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.status}`)
  return result.stdout.trim()
}

const commit = command("git", ["rev-parse", "HEAD"])
const commitTime = Number(command("git", ["show", "-s", "--format=%ct", "HEAD"]))
const dirty = command("git", ["status", "--porcelain", "--untracked-files=all"]) !== ""
if (dirty && process.env.RELEASE_ALLOW_DIRTY !== "true") {
  throw new Error("Refusing to package a dirty worktree. Commit the release inputs or set RELEASE_ALLOW_DIRTY=true for local testing.")
}

function copy(src, dest = src) {
  fs.cpSync(path.join(root, src), path.join(stage, dest), { recursive: true })
}

fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

for (const required of ["web/dist", "server/dist", "package.json", "package-lock.json", "README.md", ".env.example", "docs/deployment.md", "scripts/backup-state.mjs", "deploy/mimo-code-webui", "deploy/systemd/mimo-code-webui.service", "deploy/systemd/mimo-code-webui-backup.service", "deploy/systemd/mimo-code-webui-backup.timer"]) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing required release input: ${required}`)
}

copy("web/dist")
copy("server/dist")
copy("package.json")
copy("package-lock.json")
copy(".env.example")
copy("server/package.json")
copy("web/package.json")
copy("scripts/start.sh")
copy("scripts/start.bat")
copy("scripts/backup-state.mjs")
copy("README.md")
if (fs.existsSync(path.join(root, "docs/operations.md"))) copy("docs/operations.md")
if (fs.existsSync(path.join(root, "docs/testing.md"))) copy("docs/testing.md")
copy("docs/deployment.md")
copy("deploy")

function normalizeModes(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      fs.chmodSync(absolute, 0o755)
      normalizeModes(absolute)
    } else if (entry.isFile()) {
      const executable = absolute.endsWith(path.join("scripts", "start.sh")) || absolute.endsWith(path.join("deploy", "mimo-code-webui"))
      fs.chmodSync(absolute, executable ? 0o755 : 0o644)
    }
  }
}
normalizeModes(stage)

const releaseFiles = []
function collectFiles(directory, prefix = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name)
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) collectFiles(absolute, relative)
    else if (entry.isFile()) {
      releaseFiles.push({
        path: relative,
        size: fs.statSync(absolute).size,
        sha256: crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"),
      })
    }
  }
}
collectFiles(stage)
const manifest = {
  schemaVersion: 1,
  product: pkg.name,
  version: pkg.version,
  gitCommit: commit,
  dirty,
  sourceDateEpoch: commitTime,
  lockfileSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "package-lock.json"))).digest("hex"),
  files: releaseFiles,
}
fs.writeFileSync(path.join(stage, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

fs.rmSync(archive, { force: true })
fs.rmSync(checksum, { force: true })
const result = spawnSync("tar", [
  "--sort=name",
  `--mtime=@${commitTime}`,
  "--owner=0",
  "--group=0",
  "--numeric-owner",
  "--use-compress-program=gzip -n",
  "-cf",
  archive,
  "-C",
  outDir,
  path.basename(stage),
], { stdio: "inherit" })
if (result.status !== 0) process.exit(result.status ?? 1)
const checksumResult = spawnSync("sha256sum", [path.basename(archive)], { cwd: outDir, encoding: "utf-8" })
if (checksumResult.status !== 0) process.exit(checksumResult.status ?? 1)
fs.writeFileSync(checksum, checksumResult.stdout)
console.log(`[release] wrote ${archive}`)
console.log(`[release] wrote ${checksum}`)
