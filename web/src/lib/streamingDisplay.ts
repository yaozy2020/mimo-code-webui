export function nextStreamingDisplay(displayed: string, source: string, chunkSize = 4, maxChunkSize = 64) {
  if (!source.startsWith(displayed)) return source
  if (displayed.length >= source.length) return source
  const remaining = source.length - displayed.length
  const step = Math.min(maxChunkSize, Math.max(chunkSize, Math.ceil(remaining / 8)))
  let end = displayed.length + step
  const previous = source.charCodeAt(end - 1)
  const next = source.charCodeAt(end)
  if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1
  return source.slice(0, end)
}
