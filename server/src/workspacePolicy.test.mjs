import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { validateWorkspaceDirectory } from "./workspacePolicy.ts"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mimo-workspace-policy-"))
const root = path.join(tempDir, "root")
const project = path.join(root, "project")
const outside = path.join(tempDir, "outside")
fs.mkdirSync(project, { recursive: true })
fs.mkdirSync(outside, { recursive: true })

try {
  assert.equal(validateWorkspaceDirectory(project, root), fs.realpathSync(project))
  assert.throws(() => validateWorkspaceDirectory(outside, root), /outside workspace root/i)
  assert.throws(() => validateWorkspaceDirectory(path.join(root, "missing"), root), /does not exist/i)

  const symlink = path.join(root, "link-out")
  try {
    fs.symlinkSync(outside, symlink, "dir")
    assert.throws(() => validateWorkspaceDirectory(symlink, root), /outside workspace root/i)
  } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error
  }

  console.log("workspace policy tests passed")
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
