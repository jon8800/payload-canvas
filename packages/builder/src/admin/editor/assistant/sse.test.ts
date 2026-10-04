import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AiStreamEvent } from '../../../ai/types'
import { createSseParser, readStream, toStreamEvent, type SseMessage } from './sse'

function parseAll(chunks: string[]): SseMessage[] {
  const out: SseMessage[] = []
  const parser = createSseParser((m) => out.push(m))
  for (const chunk of chunks) parser.push(chunk)
  parser.end()
  return out
}

test('parses event and data fields, one event per blank line', () => {
  const messages = parseAll(['event: text\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"turnId":"t1","stopReason":"end_turn"}\n\n'])
  assert.deepEqual(messages, [
    { event: 'text', data: '{"text":"Hi"}' },
    { event: 'done', data: '{"turnId":"t1","stopReason":"end_turn"}' },
  ])
})

test('handles chunks split anywhere, CRLF line ends and a CRLF split across chunks', () => {
  const source = 'event: text\r\ndata: {"text":"a"}\r\n\r\n: keep-alive comment\r\n\r\nevent: text\r\ndata: {"text":"b"}\r\n\r\n'
  for (let size = 1; size <= 7; size++) {
    const chunks: string[] = []
    for (let i = 0; i < source.length; i += size) chunks.push(source.slice(i, i + size))
    assert.deepEqual(
      parseAll(chunks).map((m) => m.data),
      ['{"text":"a"}', '{"text":"b"}'],
      `chunk size ${size}`,
    )
  }
})

test('joins multi-line data, defaults the event name and flushes a final event without a blank line', () => {
  assert.deepEqual(parseAll(['data: line 1\ndata:line 2\n\n', 'event: x\ndata: last']), [
    { event: 'message', data: 'line 1\nline 2' },
    { event: 'x', data: 'last' },
  ])
})

test('ignores events with no data; lone CR line ends work', () => {
  assert.deepEqual(parseAll(['event: ping\n\nevent: text\rdata: 1\r\r']), [{ event: 'text', data: '1' }])
})

test('toStreamEvent uses the event name, accepts `type` in the JSON and drops junk', () => {
  assert.deepEqual(toStreamEvent({ event: 'text', data: '{"type":"text","text":"Hi"}' }), { type: 'text', text: 'Hi' })
  assert.deepEqual(toStreamEvent({ event: 'message', data: '{"type":"done","turnId":"t","stopReason":null}' }), {
    type: 'done',
    turnId: 't',
    stopReason: null,
  })
  assert.equal(toStreamEvent({ event: 'text', data: 'not json' }), null)
  assert.equal(toStreamEvent({ event: 'unknown', data: '{}' }), null)
  assert.equal(toStreamEvent({ event: 'text', data: '[1]' }), null)
})

test('readStream decodes UTF-8 split across byte chunks', async () => {
  const bytes = new TextEncoder().encode(
    'event: text\ndata: {"type":"text","text":"héllo ✨"}\n\nevent: error\ndata: {"type":"error","code":"no_api_key","message":"m"}\n\n',
  )
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3))
      controller.close()
    },
  })
  const events: AiStreamEvent[] = []
  await readStream(stream, (e) => events.push(e))
  assert.deepEqual(events, [
    { type: 'text', text: 'héllo ✨' },
    { type: 'error', code: 'no_api_key', message: 'm' },
  ])
})
