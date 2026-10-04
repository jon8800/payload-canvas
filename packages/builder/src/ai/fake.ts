// Scripted stand-ins for the model APIs: an Anthropic client and an OpenAI-compatible fetch. Used
// by the tests and, with the TEST-ONLY env flag BUILDER_AI_FAKE=1, by the chat endpoint, so the
// editor's Assistant panel can be tried without an API key. They stream the same raw events the
// real APIs send.

import type Anthropic from '@anthropic-ai/sdk'

import { findBlock } from '../core/tree'
import type { Block, SectionDefinition } from '../core/types'
import type { AiClient, AiStream } from './agent'

type Message = Anthropic.Beta.BetaMessage
type StreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent
type StreamParams = Parameters<AiClient['beta']['messages']['stream']>[0]

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
}

/** One scripted step: a reply, a function of the request, or an error to throw. */
export type FakeStep = FakeReply | Error | ((params: StreamParams) => FakeReply | Error)

export type FakeOptions = {
  /** Delay between stream events in ms. Default 0. */
  delayMs?: number
  /** Called before each event; throw or abort there to test failures mid-stream. */
  onEvent?: (event: StreamEvent, index: number) => void
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
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Message
}

/** Splits text into chunks of a few words, like streamed tokens. */
function chunks(text: string, size = 12): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function eventsOf(message: Message): StreamEvent[] {
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
    { type: 'message_delta', delta: { stop_reason: message.stop_reason, stop_sequence: null, stop_details: message.stop_details }, usage: { output_tokens: 0 } },
    { type: 'message_stop' },
  )
  return events as StreamEvent[]
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A fake client that answers each request with the next scripted step. `calls` records the params. */
export function createFakeClient(steps: FakeStep[] | ((params: StreamParams, call: number) => FakeStep), options: FakeOptions = {}) {
  const calls: StreamParams[] = []
  const client: AiClient = {
    beta: {
      messages: {
        stream(params, requestOptions) {
          // Copy: the loop keeps appending to its history array.
          const snapshot = structuredClone(params)
          calls.push(snapshot)
          const index = calls.length - 1
          const step = typeof steps === 'function' ? steps(snapshot, index) : steps[index]
          const resolved = typeof step === 'function' ? step(snapshot) : step
          const signal = requestOptions?.signal
          let finished: Message | null = null
          let failure: unknown = null

          const iterate = async function* (): AsyncGenerator<StreamEvent> {
            try {
              if (!resolved) throw new Error(`Fake client: no scripted step for call ${index}`)
              if (resolved instanceof Error) throw resolved
              const message = toMessage(resolved, params.model)
              const events = eventsOf(message)
              for (let i = 0; i < events.length; i++) {
                if (options.delayMs) await wait(options.delayMs)
                else await Promise.resolve()
                if (signal?.aborted) throw new FakeAbortError()
                options.onEvent?.(events[i], i)
                if (signal?.aborted) throw new FakeAbortError()
                yield events[i]
              }
              finished = message
            } catch (error) {
              failure = error
              throw error
            }
          }

          const stream: AiStream = {
            [Symbol.asyncIterator]: iterate,
            async finalMessage() {
              if (failure) throw failure
              if (!finished) throw new Error('Fake client: the stream was not read to the end')
              return finished
            },
            abort() {},
          }
          return stream
        },
      },
    },
  }
  return { client, calls }
}

// ---------------------------------------------------------------------------
// Demo script for BUILDER_AI_FAKE=1
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>
const isRecord = (value: unknown): value is AnyRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * The tool result the request ends with, and the name of its tool. Reads both formats: Anthropic
 * (a user message with tool_result blocks) and Chat Completions (`role: "tool"` messages).
 */
function lastToolResult(params: { messages: unknown[] }): { name: string | null; content: string } | null {
  const messages = params.messages.filter(isRecord)
  const last = messages.at(-1)
  if (!last) return null
  if (last.role === 'tool') {
    const assistant = messages.findLast((m) => m.role === 'assistant')
    const calls = Array.isArray(assistant?.tool_calls) ? assistant.tool_calls.filter(isRecord) : []
    const call = calls.find((c) => c.id === last.tool_call_id)
    const name = isRecord(call?.function) && typeof call.function.name === 'string' ? call.function.name : null
    return { name, content: typeof last.content === 'string' ? last.content : '' }
  }
  if (last.role !== 'user' || !Array.isArray(last.content)) return null
  const result = last.content.filter(isRecord).find((b) => b.type === 'tool_result')
  if (!result) return null
  // Find the tool name from the assistant message before it.
  const previous = messages.at(-2)
  const call = Array.isArray(previous?.content)
    ? previous.content.filter(isRecord).find((b) => b.type === 'tool_use' && b.id === result.tool_use_id)
    : undefined
  const content = typeof result.content === 'string' ? result.content : ''
  return { name: call && typeof call.name === 'string' ? call.name : null, content }
}

function firstOfType(blocks: Block[], types: string[]): Block | null {
  for (const block of blocks) {
    if (types.includes(block.type)) return block
    for (const children of Object.values(block.slots ?? {})) {
      const found = firstOfType(children, types)
      if (found) return found
    }
  }
  return null
}

/**
 * The demo: inserts a hero section at the top of the page, then changes its heading, streaming a
 * little text before, between and after. Without sections it only answers with text.
 */
export function demoScript(sections: SectionDefinition[]) {
  const hero = sections.find((s) => s.id === 'hero') ?? sections.find((s) => /hero/i.test(`${s.category} ${s.label}`)) ?? sections[0]
  let n = 0
  const id = () => `toolu_fake_${Date.now().toString(36)}_${++n}`
  const thinking: FakeBlock = { type: 'thinking', thinking: '', signature: 'fake-signature' }

  return (params: { messages: unknown[] }): FakeReply => {
    const last = lastToolResult(params)
    if (!hero) {
      return {
        content: [{ type: 'text', text: 'This is the test model (BUILDER_AI_FAKE=1). The site has no sections, so I made no changes.' }],
        stop_reason: 'end_turn',
      }
    }
    if (!last) {
      return {
        content: [
          thinking,
          { type: 'text', text: `I'll add the ${hero.label} section at the top of the page. (Test model: BUILDER_AI_FAKE=1.)` },
          { type: 'tool_use', id: id(), name: 'insertSection', input: { sectionId: hero.id, index: 0 } },
        ],
        stop_reason: 'tool_use',
      }
    }
    if (last.name === 'insertSection') {
      let inserted: Block[] = []
      try {
        inserted = (JSON.parse(last.content) as { inserted?: Block[] }).inserted ?? []
      } catch {
        inserted = []
      }
      const heading = firstOfType(inserted, ['heading', 'text'])
      if (heading && findBlock({ version: 1, blocks: inserted }, heading.id)) {
        return {
          content: [
            thinking,
            { type: 'text', text: 'Now I will change its heading.' },
            {
              type: 'tool_use',
              id: id(),
              name: 'applyOperations',
              input: { operations: [{ type: 'update', id: heading.id, props: { text: 'Built with the AI assistant' } }] },
            },
          ],
          stop_reason: 'tool_use',
        }
      }
    }
    return {
      content: [{ type: 'text', text: `Done. I added the ${hero.label} section at the top and changed its heading. Press undo to remove both changes.` }],
      stop_reason: 'end_turn',
    }
  }
}

/** The fake client for BUILDER_AI_FAKE=1: the demo script, streamed with small delays. */
export function demoClient(sections: SectionDefinition[]): AiClient {
  return createFakeClient(demoScript(sections), { delayMs: 25 }).client
}

// ---------------------------------------------------------------------------
// OpenAI-compatible fake (a fetch function)
// ---------------------------------------------------------------------------

/** A Chat Completions request body as the fake sees it. */
export type FakeChatBody = { model: string; messages: unknown[]; [key: string]: unknown }

/**
 * One scripted response of the fake fetch:
 * - a FakeReply: streamed as Chat Completions chunks (text, reasoning, tool calls in fragments);
 * - `{ status, body }`: an HTTP error with a JSON body;
 * - `{ sse: [...] }`: raw body chunks, sent as they are;
 * - an Error: fetch rejects with it (a network error).
 */
export type FakeChatStep =
  | FakeReply
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | { sse: string[] }
  | Error
  | ((body: FakeChatBody) => FakeChatStep)

const FINISH: Record<string, string> = { tool_use: 'tool_calls', end_turn: 'stop', max_tokens: 'length', refusal: 'content_filter' }

/** Chat Completions SSE frames for a scripted reply. Tool arguments arrive in 7-character fragments. */
export function chatChunks(reply: FakeReply, model = 'fake-model'): string[] {
  const frame = (delta: AnyRecord, finish: string | null = null, extra: AnyRecord = {}) =>
    `data: ${JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`
  const out = [frame({ role: 'assistant', content: '' })]
  let index = 0
  for (const block of reply.content) {
    if (block.type === 'text') for (const text of chunks(block.text)) out.push(frame({ content: text }))
    else if (block.type === 'thinking' && block.thinking) out.push(frame({ reasoning: block.thinking }))
    else if (block.type === 'tool_use') {
      out.push(frame({ tool_calls: [{ index, id: block.id, type: 'function', function: { name: block.name, arguments: '' } }] }))
      for (const part of chunks(JSON.stringify(block.input), 7)) out.push(frame({ tool_calls: [{ index, function: { arguments: part } }] }))
      index++
    }
  }
  out.push(frame({}, FINISH[reply.stop_reason ?? 'end_turn'] ?? 'stop'))
  out.push(`data: ${JSON.stringify({ id: 'chatcmpl-fake', choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })}\n\n`)
  out.push('data: [DONE]\n\n')
  return out
}

/** A fetch that answers each Chat Completions request with the next scripted step. `calls` records the bodies. */
export function createFakeChatFetch(steps: FakeChatStep[] | ((body: FakeChatBody, call: number) => FakeChatStep), options: { delayMs?: number } = {}) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: FakeChatBody }> = []
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as FakeChatBody
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) }, body })
    const index = calls.length - 1
    let step = typeof steps === 'function' ? steps(body, index) : steps[index]
    while (typeof step === 'function') step = step(body)
    if (!step) throw new Error(`Fake fetch: no scripted step for call ${index}`)
    if (step instanceof Error) throw step
    const signal = init?.signal ?? undefined
    if (signal?.aborted) throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
    if ('status' in step) {
      return new Response(step.body === undefined ? null : JSON.stringify(step.body), {
        status: step.status,
        headers: { 'content-type': 'application/json', ...step.headers },
      })
    }
    const frames = 'sse' in step ? step.sse : chatChunks(step, body.model)
    const encoder = new TextEncoder()
    let i = 0
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (options.delayMs) await wait(options.delayMs)
        if (signal?.aborted) return controller.error(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
        if (i >= frames.length) return controller.close()
        controller.enqueue(encoder.encode(frames[i++]))
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  return { fetch: fakeFetch as typeof fetch, calls }
}

/** The fake fetch for BUILDER_AI_FAKE=1 with an OpenAI-compatible provider: the same demo script. */
export function demoFetch(sections: SectionDefinition[]): typeof fetch {
  return createFakeChatFetch(demoScript(sections), { delayMs: 25 }).fetch
}
