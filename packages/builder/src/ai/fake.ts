// A scripted stand-in for the Anthropic client. Used by the tests and, with the TEST-ONLY env flag
// BUILDER_AI_FAKE=1, by the chat endpoint, so the editor's Assistant panel can be tried without an
// API key. It streams the same raw events the real API sends.

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

function lastToolResult(params: StreamParams): { name: string | null; content: string } | null {
  const last = params.messages.at(-1)
  if (!last || last.role !== 'user' || !Array.isArray(last.content)) return null
  const result = last.content.find((b) => b.type === 'tool_result')
  if (!result || result.type !== 'tool_result') return null
  // Find the tool name from the assistant message before it.
  const previous = params.messages.at(-2)
  const call = Array.isArray(previous?.content)
    ? previous.content.find((b) => b.type === 'tool_use' && b.id === result.tool_use_id)
    : undefined
  const content = typeof result.content === 'string' ? result.content : ''
  return { name: call && call.type === 'tool_use' ? call.name : null, content }
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

  return (params: StreamParams): FakeReply => {
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
