export function claimRequest<T>(owners: Map<string, T>, key: string, request: T) {
  owners.set(key, request)
}

export function releaseRequest<T>(owners: Map<string, T>, key: string, request: T) {
  if (owners.get(key) !== request) return false
  owners.delete(key)
  return true
}
