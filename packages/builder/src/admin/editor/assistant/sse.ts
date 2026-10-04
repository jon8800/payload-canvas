// Server-Sent Events parser for the assistant's POST stream. `EventSource` only does GET, so the
// panel reads the response body itself. Follows the SSE spec: `event:` and `data:` fields,
// multi-line data joined with "\n", comments (`:`), CRLF / LF / CR line ends, a blank line
// dispatches. Chunks may split anywhere, even inside a line.

import type { AiStreamEvent } from '../../../ai/types'

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

const TYPES = new Set(['text', 'tool', 'operations', 'message', 'done', 'error'])

/** Turns one SSE message into an `AiStreamEvent`. Unknown event types and bad JSON return null. */
export function toStreamEvent(message: SseMessage): AiStreamEvent | null {
  let payload: unknown
  try {
    payload = JSON.parse(message.data)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  // The `event:` field names the type. Without one, accept a `type` inside the JSON.
  const type = message.event !== 'message' ? message.event : record.type
  if (typeof type !== 'string' || !TYPES.has(type)) return null
  return { ...record, type } as AiStreamEvent
}

/** Reads a fetch response body as SSE and calls `onEvent` for every assistant stream event. */
export async function readStream(body: ReadableStream<Uint8Array>, onEvent: (event: AiStreamEvent) => void) {
  const parser = createSseParser((message) => {
    const event = toStreamEvent(message)
    if (event) onEvent(event)
  })
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.end()
  } finally {
    reader.releaseLock()
  }
}
