export function parseSSEBuffer(input: string, flush = false) {
  const frames: string[] = []
  const boundary = /\r\n\r\n|\n\n|\r\r/g
  let offset = 0
  for (let match = boundary.exec(input); match; match = boundary.exec(input)) {
    frames.push(input.slice(offset, match.index))
    offset = match.index + match[0].length
  }
  const remainder = input.slice(offset)
  if (flush && remainder) frames.push(remainder)
  const data = frames.flatMap((frame) => {
    const lines = frame.split(/\r\n|\r|\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
    return lines.length ? [lines.join("\n")] : []
  })
  return { data, rest: flush ? "" : remainder }
}
