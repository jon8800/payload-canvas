// Server-Sent Events parser for the assistant's POST stream. `EventSource` only does GET, so the
// panel reads the response body itself. Follows the SSE spec: `event:` and `data:` fields,
// multi-line data joined with "\n", comments (`:`), CRLF / LF / CR line ends, a blank line
// dispatches. Chunks may split anywhere, even inside a line. The parser itself lives in ai/sse.ts.

import { createSseParser, type SseMessage } from '../../../ai/sse'
import type { AiStreamEvent } from '../../../ai/types'

export { createSseParser, type SseMessage }

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
