// Test data for the Anthropic adapter: a fake Anthropic client that streams scripted replies as raw
// Messages API events, and a "recorded" fixture in the real streaming format.

import type Anthropic from '@anthropic-ai/sdk'

import type { AnthropicClient, AnthropicStream } from './anthropic'

type Message = Anthropic.Beta.BetaMessage
type StreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent
export type StreamParams = Parameters<AnthropicClient['beta']['messages']['stream']>[0]
type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }

/** A content block of a scripted reply (a subset of the API's blocks). */
export type FakeBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'fallback'; from: { model: string }; to: { model: string } }

export type FakeReply = {
  content: FakeBlock[]
  stop_reason: Message['stop_reason']
  stop_details?: { category: string | null; explanation: string | null } | null
  usage?: Partial<Usage>
}

/** Raw stream events and the final message, as a real API call returns them. */
export type RecordedReply = { events: StreamEvent[]; message: Message }

/** One scripted step: a reply, a recorded call, or an error to throw. */
export type FakeStep = FakeReply | RecordedReply | Error

export type FakeOptions = {
  /** Called before each event (with the call number); throw or abort there to fail mid-stream. */
  onEvent?: (event: StreamEvent, index: number, call: number) => void
  /** `client.apiKey`. Default "test-key"; null simulates a client without credentials. */
  apiKey?: string | null
}

export class FakeAbortError extends Error {
  constructor() {
    super('Request was aborted.')
    this.name = 'FakeAbortError'
  }
}

let messageCount = 0

function toMessage(reply: FakeReply, model: string): Message {
  messageCount++
  return {
    id: `msg_fake_${messageCount}`,
    type: 'message',
    role: 'assistant',
    model,
    content: reply.content,
    stop_reason: reply.stop_reason,
    stop_sequence: null,
    stop_details: reply.stop_details ?? null,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...reply.usage },
  } as unknown as Message
}

/** Splits text into chunks, like streamed tokens. */
function chunks(text: string, size = 12): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

/** The raw events the API sends for a message. */
export function eventsOf(message: Message): StreamEvent[] {
  const events: unknown[] = [{ type: 'message_start', message: { ...message, content: [], stop_reason: null } }]
  ;(message.content as unknown as FakeBlock[]).forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } })
      for (const text of chunks(block.text)) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })
    } else if (block.type === 'thinking') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } })
      if (block.thinking) events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } })
    } else if (block.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } })
      for (const partial_json of chunks(JSON.stringify(block.input), 40)) {
        events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json } })
      }
    } else {
      events.push({ type: 'content_block_start', index, content_block: block })
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason: message.stop_reason, stop_sequence: null, stop_details: message.stop_details },
      usage: { output_tokens: message.usage.output_tokens },
    },
    { type: 'message_stop' },
  )
  return events as StreamEvent[]
}

/**
 * A fake stream: an async iterable of raw events plus `finalMessage()`, like the SDK's
 * `client.beta.messages.stream()`. An abort or a throw in `onEvent` fails the stream.
 */
export function streamFrom(events: StreamEvent[], message: Message, signal?: AbortSignal, onEvent?: (event: StreamEvent, index: number) => void): AnthropicStream {
  let finished = false
  let failure: unknown = null
  const iterate = async function* (): AsyncGenerator<StreamEvent> {
    try {
      for (let i = 0; i < events.length; i++) {
        await Promise.resolve()
        if (signal?.aborted) throw new FakeAbortError()
        onEvent?.(events[i], i)
        if (signal?.aborted) throw new FakeAbortError()
        yield events[i]
      }
      finished = true
    } catch (error) {
      failure = error
      throw error
    }
  }
  return {
    [Symbol.asyncIterator]: iterate,
    async finalMessage() {
      if (failure) throw failure
      if (!finished) throw new Error('Fake client: the stream was not read to the end')
      return message
    },
    abort() {},
  }
}

/** A stream that throws `error` when read, before any event. */
function failingStream(error: unknown): AnthropicStream {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    async finalMessage() {
      throw error
    },
    abort() {},
  }
}

/** A fake client that answers each request with the next scripted step. `calls` records the params. */
export function createFakeClient(steps: FakeStep[] | ((params: StreamParams, call: number) => FakeStep), options: FakeOptions = {}) {
  const calls: StreamParams[] = []
  const client: AnthropicClient = {
    apiKey: options.apiKey === undefined ? 'test-key' : options.apiKey,
    beta: {
      messages: {
        stream(params, requestOptions) {
          // Copy: the loop keeps appending to its history array.
          const snapshot = structuredClone(params)
          calls.push(snapshot)
          const call = calls.length - 1
          const step = typeof steps === 'function' ? steps(snapshot, call) : steps[call]
          if (!step) return failingStream(new Error(`Fake client: no scripted step for call ${call}`))
          if (step instanceof Error) return failingStream(step)
          const onEvent = options.onEvent && ((event: StreamEvent, index: number) => options.onEvent?.(event, index, call))
          if ('events' in step) return streamFrom(step.events, step.message, requestOptions?.signal, onEvent)
          const message = toMessage(step, params.model)
          return streamFrom(eventsOf(message), message, requestOptions?.signal, onEvent)
        },
      },
    },
  }
  return { client, calls }
}

// ---------------------------------------------------------------------------
// Recorded fixture: one reply with thinking, text and a tool call
// ---------------------------------------------------------------------------

export const RECORDED_TEXT_DELTAS = ['I will add the ', 'hero section ', 'at the top.']
export const RECORDED_TOOL_INPUT = { sectionId: 'hero', index: 0 }
export const RECORDED_USAGE = { input_tokens: 120, output_tokens: 85, cache_creation_input_tokens: 300, cache_read_input_tokens: 2000 }

const recordedContent = [
  { type: 'thinking', thinking: 'The user wants a hero. I should insert it first.', signature: 'EqQBCkYIARgCKkD3signature==' },
  { type: 'text', text: RECORDED_TEXT_DELTAS.join('') },
  { type: 'tool_use', id: 'toolu_01Abc', name: 'insertSection', input: RECORDED_TOOL_INPUT },
]

export const recordedMessage = {
  id: 'msg_01Recorded',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: recordedContent,
  stop_reason: 'tool_use',
  stop_sequence: null,
  stop_details: null,
  usage: RECORDED_USAGE,
} as unknown as Message

export const recordedEvents = [
  {
    type: 'message_start',
    message: { ...recordedMessage, content: [], stop_reason: null, usage: { ...RECORDED_USAGE, output_tokens: 1 } },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'The user wants a hero. ' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'I should insert it first.' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'EqQBCkYIARgCKkD3signature==' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '', citations: null } },
  ...RECORDED_TEXT_DELTAS.map((text) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } })),
  { type: 'content_block_stop', index: 1 },
  { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_01Abc', name: 'insertSection', input: {} } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"sectionId": ' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"hero", "ind' } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: 'ex": 0}' } },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null, stop_details: null }, usage: RECORDED_USAGE },
  { type: 'message_stop' },
] as unknown as StreamEvent[]

export const recordedReply: RecordedReply = { events: recordedEvents, message: recordedMessage }
