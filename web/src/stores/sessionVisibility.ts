import type { Session } from "../types"

export function visibleSessionIDsAfterLoad(input: {
  sessions: Session[]
  ownedSessionIDs: string[]
  attachedSessionIDs: string[]
}) {
  const visible = new Set([...input.ownedSessionIDs, ...input.attachedSessionIDs])
  if (input.sessions.length === 0) return visible
  const serverIDs = new Set(input.sessions.map((session) => session.id))
  const hasVisibleServerSession = [...visible].some((id) => serverIDs.has(id))
  if (visible.size > 0 && hasVisibleServerSession) return visible
  return serverIDs
}
