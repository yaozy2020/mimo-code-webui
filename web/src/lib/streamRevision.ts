let revision = 0

export function recordStreamEvent() {
  revision += 1
}

export function getStreamRevision() {
  return revision
}

export function isCurrentStreamRevision(expected: number) {
  return revision === expected
}
