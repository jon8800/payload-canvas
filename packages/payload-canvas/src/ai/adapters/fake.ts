// A scripted model as an AiAdapter, for tests and for trying the panel without an API key. No
// network, no cost. Never use it in production.
//
//   import { fakeAdapter } from 'payload-canvas/ai/fake'
//   ai: { adapter: fakeAdapter() }
//
// Without `steps` it plays a demo: it lists the sections, inserts a hero section at the top of the
// page, changes its heading, and streams a few sentences in between.

import { isPlainObject } from '../../core/tree'
import type { Block } from '../../core/types'
import type { AiAdapter, AiContentBlock, AiMessage, AiModelEvent, AiModelRequest, AiStopReason, AiUsage } from '../types'

/** One scripted model reply. `stopReason` default: "tool_use" when it has tool_use blocks, else "end_turn". */
export type FakeReply = {
  content: AiContentBlock[]
  stopReason?: AiStopReason
  usage?: AiUsage
  refusal?: { explanation: string | null }
}

/** One scripted step: a reply, an error event, or a function of the request that returns one. */
export type FakeStep = FakeReply | Extract<AiModelEvent, { type: 'error' }> | ((request: AiModelRequest, call: number) => FakeReply | Extract<AiModelEvent, { type: 'error' }>)

export type FakeAdapterOptions = {
  /** The replies, one per model call. Default: the demo script. */
  steps?: FakeStep[] | ((request: AiModelRequest, call: number) => FakeStep)
  /** Delay between streamed events in ms. Default 25 for the demo, 0 with `steps`. */
  delayMs?: number
  /** Default "fake". */
  name?: string
  /** Default "scripted". */
  model?: string
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Splits text into chunks of a few characters, like streamed tokens. */
function chunks(text: string, size = 12): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

let callCounter = 0

/** The model events of a scripted reply. */
export function fakeEvents(reply: FakeReply): AiModelEvent[] {
  const events: AiModelEvent[] = []
  const calls: AiModelEvent[] = []
  for (const block of reply.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      for (const text of chunks(block.text)) events.push({ type: 'text', text })
    } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
      events.push({ type: 'toolStart', id: block.id, name: block.name })
      calls.push({ type: 'toolCall', id: block.id, name: block.name, input: block.input })
    }
  }
  events.push(...calls)
  events.push({ type: 'usage', usage: reply.usage ?? { inputTokens: 100, outputTokens: 20 } })
  const stopReason = reply.stopReason ?? (calls.length > 0 ? 'tool_use' : 'end_turn')
  events.push({ type: 'done', stopReason, content: reply.refusal ? [] : reply.content, ...(reply.refusal ? { refusal: reply.refusal } : {}) })
  return events
}

export function fakeAdapter(options: FakeAdapterOptions = {}): AiAdapter {
  const script = options.steps ?? demoStep
  const delayMs = options.delayMs ?? (options.steps ? 0 : 25)
  let call = 0
  return {
    name: options.name ?? 'fake',
    label: 'Test model',
    model: options.model ?? 'scripted',
    ready: true,
    setupProblem: null,
    async *stream(request) {
      const index = call++
      let step = typeof script === 'function' ? script(request, index) : script[index]
      if (typeof step === 'function') step = step(request, index)
      if (!step) {
        yield { type: 'error', code: 'api_error', message: `Fake adapter: no scripted step for call ${index}` }
        return
      }
      if ('type' in step && step.type === 'error') {
        yield step
        return
      }
      for (const event of fakeEvents(step as FakeReply)) {
        if (delayMs) await wait(delayMs)
        else await Promise.resolve()
        if (request.signal?.aborted) {
          yield { type: 'error', code: 'aborted', message: 'The request was cancelled.' }
          return
        }
        yield event
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Demo script
// ---------------------------------------------------------------------------

type Blocks = Array<Record<string, unknown>>
const blocksOf = (content: unknown): Blocks => (Array.isArray(content) ? content.filter(isPlainObject) : [])

/** The tool result the request ends with, and its tool's name. Null at the start of a turn. */
function lastToolResult(messages: AiMessage[]): { name: string | null; content: string } | null {
  const last = messages.at(-1)
  if (!last || last.kind !== 'tool_results') return null
  const result = blocksOf(last.content).find((b) => b.type === 'tool_result')
  if (!result) return null
  const call = blocksOf(messages.at(-2)?.content).find((b) => b.type === 'tool_use' && b.id === result.tool_use_id)
  return { name: typeof call?.name === 'string' ? call.name : null, content: typeof result.content === 'string' ? result.content : '' }
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

const parse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

const NOTE = '(Test model: no API key is used.)'
const newCallId = () => `call_fake_${Date.now().toString(36)}_${++callCounter}`

/** The demo: list sections, insert a hero at the top, change its heading, then summarize. */
function demoStep(request: AiModelRequest): FakeReply {
  const last = lastToolResult(request.messages)
  const hasSections = request.tools.some((t) => t.name === 'insertSection')
  if (!last) {
    if (!hasSections) return { content: [{ type: 'text', text: `This site has no sections, so I made no changes. ${NOTE}` }] }
    return {
      content: [
        { type: 'text', text: `I'll look at the sections and add a hero at the top of the page. ${NOTE}` },
        { type: 'tool_use', id: newCallId(), name: 'listSections', input: {} },
      ],
    }
  }
  if (last.name === 'listSections') {
    const list = parse<Array<{ id?: unknown; label?: unknown; category?: unknown }>>(last.content, [])
    const pick = list.find((s) => s.id === 'hero') ?? list.find((s) => /hero/i.test(`${String(s.category)} ${String(s.label)}`)) ?? list[0]
    if (!pick || typeof pick.id !== 'string') return { content: [{ type: 'text', text: 'There are no sections to insert.' }] }
    return {
      content: [
        { type: 'text', text: `I'll insert the ${String(pick.label ?? pick.id)} section.` },
        { type: 'tool_use', id: newCallId(), name: 'insertSection', input: { sectionId: pick.id, index: 0 } },
      ],
    }
  }
  if (last.name === 'insertSection') {
    const inserted = parse<{ inserted?: Block[] }>(last.content, {}).inserted ?? []
    const heading = firstOfType(inserted, ['heading', 'text'])
    if (heading) {
      return {
        content: [
          { type: 'text', text: 'Now I will change its heading.' },
          {
            type: 'tool_use',
            id: newCallId(),
            name: 'applyOperations',
            input: { operations: [{ type: 'update', id: heading.id, props: { text: 'Built with the AI assistant' } }] },
          },
        ],
      }
    }
  }
  return { content: [{ type: 'text', text: 'Done. I added a hero section at the top and changed its heading. Press undo to remove both changes.' }] }
}
