// Server-Sent Events parser, shared by the editor (the assistant stream) and the server (OpenAI-
// compatible model streams). Follows the SSE spec: `event:` and `data:` fields, multi-line data
// joined with "\n", comments (`:`), CRLF / LF / CR line ends, a blank line dispatches. Chunks may
// split anywhere, even inside a line.

export type SseMessage = { event: string; data: string }

/** Incremental parser. `push` text chunks in order, then `end()` to flush a final event without a blank line. */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = ''
  let event = ''
  let data: string[] = []

  const dispatch = () => {
    if (data.length > 0) onMessage({ event: event || 'message', data: data.join('\n') })
    event = ''
    data = []
  }

  const line = (text: string) => {
    if (text === '') return dispatch()
    if (text.startsWith(':')) return
    const colon = text.indexOf(':')
    const field = colon === -1 ? text : text.slice(0, colon)
    let value = colon === -1 ? '' : text.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    // `id` and `retry` do not matter for a one-shot POST stream.
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let start = 0
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i]
        if (c !== '\n' && c !== '\r') continue
        // A CR at the very end may be the first half of CRLF: wait for the next chunk.
        if (c === '\r' && i === buffer.length - 1) break
        line(buffer.slice(start, i))
        if (c === '\r' && buffer[i + 1] === '\n') i++
        start = i + 1
      }
      buffer = buffer.slice(start)
    },
    end() {
      if (buffer) line(buffer.replace(/\r$/, ''))
      buffer = ''
      dispatch()
    },
  }
}
