import fs from "node:fs"
import path from "node:path"

function assertDirectory(directory: string) {
  try {
    if (fs.statSync(directory).isDirectory()) return
  } catch {
    throw new Error(`Workspace directory does not exist: ${directory}`)
  }
  throw new Error(`Workspace path is not a directory: ${directory}`)
}

export function validateWorkspaceDirectory(input: string, root: string): string {
  const resolvedRoot = fs.realpathSync(path.resolve(root))
  const resolvedInput = path.resolve(input)
  assertDirectory(resolvedInput)
  const realInput = fs.realpathSync(resolvedInput)
  const relative = path.relative(resolvedRoot, realInput)
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return realInput
  }
  throw new Error(`Workspace directory is outside workspace root: ${input}`)
}
