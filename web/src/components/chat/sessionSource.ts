function normalizeDirectory(directory?: string | null) {
  return directory?.replace(/\/+$/, "") || null
}

export function getSessionSource(
  sessionID: string,
  ownedSessionIDs: string[],
  attachedSessionIDs: string[],
  sessionDirectory?: string | null,
  currentWorkspace?: string | null,
) {
  const external = attachedSessionIDs.includes(sessionID) && !ownedSessionIDs.includes(sessionID)
  const sameWorkspace = normalizeDirectory(sessionDirectory) === normalizeDirectory(currentWorkspace)
  if (external && sameWorkspace) return { external: false }
  if (!external) return { external: false }
  return {
    external: true,
    label: "接入会话",
    description: "这个会话是当前浏览器接入的已有会话，可能来自 WebUI、CLI 或其它客户端。",
  }
}
