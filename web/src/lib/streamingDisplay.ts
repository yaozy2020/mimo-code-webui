export function nextStreamingDisplay(displayed: string, source: string, chunkSize = 4) {
  if (!source.startsWith(displayed)) return source
  if (displayed.length >= source.length) return source
  const remaining = source.length - displayed.length
  const step = remaining > 120 ? Math.max(chunkSize, Math.ceil(remaining / 8)) : chunkSize
  return source.slice(0, Math.min(source.length, displayed.length + step))
}
