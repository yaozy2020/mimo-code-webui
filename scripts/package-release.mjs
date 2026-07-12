import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import os from "node:os"
import { fileURLToPath } from "node:url"

const root = process.env.RELEASE_ROOT ? path.resolve(process.env.RELEASE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const mode = process.argv[2]
const provenanceOnly = process.argv.includes("--provenance-only")
if (!new Set(["--release", "--unsigned"]).has(mode)) throw new Error("Use --release for formal signed releases or --unsigned for development artifacts")
const formal = mode === "--release"
const commit = command("git", ["rev-parse", "HEAD"])
const pkg = JSON.parse(formal ? command("git", ["show", `${commit}:package.json`]) : fs.readFileSync(path.join(root, "package.json"), "utf-8"))
const artifactSuffix = formal ? "" : ".unsigned"
const outDir = path.join(root, "dist-release")
const stage = path.join(outDir, `mimo-code-webui-v${pkg.version}${artifactSuffix}`)
const archive = path.join(outDir, `mimo-code-webui-v${pkg.version}${artifactSuffix}.tar.gz`)
const checksum = `${archive}.sha256`
const signature = `${archive}.sig`

if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pkg.version)) throw new Error(`Formal packaging requires a safe semantic version; found ${pkg.version}`)

function command(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf-8", ...options })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.status}`)
  return result.stdout?.trim() ?? ""
}

const commitTime = Number(command("git", ["show", "-s", "--format=%ct", "HEAD"]))
const dirty = command("git", ["status", "--porcelain", "--untracked-files=no"]) !== ""
if (formal) {
  if (!process.env.RELEASE_SIGNING_KEY) throw new Error("RELEASE_SIGNING_KEY is required for a formal release")
  const key = path.resolve(process.env.RELEASE_SIGNING_KEY)
  let keyStat
  try { keyStat = fs.lstatSync(key) } catch { throw new Error(`Release signing key not found: ${key}`) }
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error(`Release signing key must be a regular file and not a symlink: ${key}`)
  if (keyStat.uid !== process.getuid()) throw new Error(`Release signing key must be owned by the current uid: ${key}`)
  const keyMode = keyStat.mode & 0o777
  if ((keyMode & 0o177) !== 0) throw new Error(`Release signing key must have mode 0600 or stricter: ${key}`)
  if (dirty) throw new Error("Refusing formal release from a dirty tracked worktree")
  const branch = command("git", ["branch", "--show-current"])
  if (branch !== "main") throw new Error(`Formal releases require approved release branch main; found ${branch || "detached HEAD"}`)
  const expectedTag = `v${pkg.version}`
  const tagTypeResult = spawnSync("git", ["cat-file", "-t", `refs/tags/${expectedTag}`], { cwd: root, encoding: "utf8" })
  if (tagTypeResult.status !== 0) throw new Error(`HEAD must have annotated or signed tag ${expectedTag}`)
  const tagType = tagTypeResult.stdout.trim()
  if (tagType !== "tag") throw new Error(`Formal release tag ${expectedTag} must be annotated or signed`)
  const taggedCommit = command("git", ["rev-parse", "--verify", `${expectedTag}^{commit}`])
  if (taggedCommit !== commit) throw new Error(`Formal release tag ${expectedTag} must point at HEAD`)
  console.log(`[release] formal release provenance verified: version=${pkg.version} commit=${commit} branch=${branch} tag=${expectedTag}`)
} else {
  console.log(`[release] development unsigned packaging: version=${pkg.version} commit=${commit}`)
}

if (provenanceOnly) process.exit(0)

let sourceRoot = root
let worktree
if (formal) {
  worktree = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-formal-release-"))
  try {
    command("git", ["worktree", "add", "--detach", worktree, commit])
    command("npm", ["ci"], { cwd: worktree, stdio: "inherit" })
    command("npm", ["run", "build"], { cwd: worktree, stdio: "inherit" })
    sourceRoot = worktree
  } catch (error) {
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root, stdio: "ignore" })
    fs.rmSync(worktree, { recursive: true, force: true })
    throw error
  }
}

function copy(src, dest = src) {
  fs.cpSync(path.join(sourceRoot, src), path.join(stage, dest), { recursive: true })
}

try {
  fs.rmSync(stage, { recursive: true, force: true })
  fs.mkdirSync(stage, { recursive: true })

  for (const required of ["web/dist", "server/dist", "package.json", "package-lock.json", "README.md", ".env.example", "docs/deployment.md", "scripts/backup-state.mjs", "scripts/backup-service-state.sh", "scripts/send-alert.sh", "deploy/mimo-code-webui", "deploy/rollback-safety-contract-v1", "deploy/systemd/mimo-code-webui.service", "deploy/systemd/mimo-code-webui-backup.service", "deploy/systemd/mimo-code-webui-backup.timer", "deploy/systemd/mimo-code-webui-alert@.service"]) {
    if (!fs.existsSync(path.join(sourceRoot, required))) throw new Error(`Missing required release input: ${required}`)
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
copy("scripts/backup-service-state.sh")
copy("scripts/send-alert.sh")
copy("README.md")
if (fs.existsSync(path.join(sourceRoot, "docs/operations.md"))) copy("docs/operations.md")
if (fs.existsSync(path.join(sourceRoot, "docs/testing.md"))) copy("docs/testing.md")
copy("docs/deployment.md")
copy("deploy")

function normalizeModes(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      fs.chmodSync(absolute, 0o755)
      normalizeModes(absolute)
    } else if (entry.isFile()) {
      const executable = absolute.endsWith(path.join("scripts", "start.sh")) || absolute.endsWith(path.join("scripts", "backup-service-state.sh")) || absolute.endsWith(path.join("scripts", "send-alert.sh")) || absolute.endsWith(path.join("deploy", "mimo-code-webui"))
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
  lockfileSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(sourceRoot, "package-lock.json"))).digest("hex"),
  files: releaseFiles,
}
fs.writeFileSync(path.join(stage, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

fs.rmSync(archive, { force: true })
fs.rmSync(checksum, { force: true })
fs.rmSync(signature, { force: true })
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
if (result.status !== 0) throw new Error(`tar failed: ${result.status}`)
const checksumResult = spawnSync("sha256sum", [path.basename(archive)], { cwd: outDir, encoding: "utf-8" })
if (checksumResult.status !== 0) throw new Error(`sha256sum failed: ${checksumResult.stderr || checksumResult.status}`)
fs.writeFileSync(checksum, checksumResult.stdout)
console.log(`[release] wrote ${archive}`)
console.log(`[release] wrote ${checksum}`)
if (formal) {
  const key = path.resolve(process.env.RELEASE_SIGNING_KEY)
  const sign = spawnSync("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", key, "-in", archive, "-out", signature], { stdio: "inherit" })
  if (sign.status !== 0) throw new Error(`openssl signing failed: ${sign.status}`)
  console.log(`[release] wrote ${signature}`)
}
} finally {
  if (worktree) {
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root, stdio: "ignore" })
    fs.rmSync(worktree, { recursive: true, force: true })
  }
}
