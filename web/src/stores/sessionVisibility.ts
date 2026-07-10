import type { Session } from "../types"

export function visibleSessionIDsAfterLoad(input: {
  sessions: Session[]
  ownedSessionIDs: string[]
  attachedSessionIDs: string[]
}) {
  const visible = new Set([...input.ownedSessionIDs, ...input.attachedSessionIDs])
  if (visible.size > 0 || input.sessions.length === 0) return visible
  return new Set(input.sessions.map((session) => session.id))
}
