import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import { fakeAdapter, type FakeStep } from './adapters/fake'
import { adapterIdentity, NOT_RUN, runAgent } from './loop'
import { toolDefinitions, Workspace, type ToolEnv } from './tools'
import type { AiAdapter, AiMessage, AiModelEvent, AiStreamEvent } from './types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true }] },
]
const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  category: 'Heroes',
  blocks: [{ id: 'sec', type: 'stack', slots: { children: [{ id: 'title', type: 'heading', props: { text: 'Welcome' } }] } }],
}
const env: ToolEnv = { blocks, sections: [hero], bindingSources: null, searchMedia: async () => [] }
const startLayout: Layout = { version: 1, blocks: [{ id: 'b_intro', type: 'heading', props: { text: 'Intro' } }] }
const userMessage: AiMessage = { role: 'user', content: 'Add a hero' }
const context: AiMessage = { role: 'user', kind: 'context', content: [{ type: 'text', text: '<editor_context>…</editor_context>' }] }

async function run(adapter: AiAdapter, options: { signal?: AbortSignal; maxSteps?: number } = {}) {
  const events: AiStreamEvent[] = []
  const workspace = new Workspace(structuredClone(startLayout), blocks)
  await runAgent({
    adapter,
    system: [{ text: 'SYSTEM', cache: true }],
    tools: toolDefinitions(env),
    maxSteps: options.maxSteps ?? 6,
    messages: [userMessage],
    context,
    workspace,
    env,
    emit: (event) => events.push(event),
    signal: options.signal,
    turnId: 'turn_1',
  })
  return { events, workspace }
}

const steps = (...list: FakeStep[]) => fakeAdapter({ steps: list })
const readLayout: FakeStep = () => ({ content: [{ type: 'tool_use', id: `c${Math.random()}`, name: 'getLayout', input: {} }] })

/** Compact event names, with consecutive text events merged. */
function shape(events: AiStreamEvent[]): string[] {
  const out: string[] = []
  for (const e of events) {
    let name: string
    if (e.type === 'text') name = 'text'
    else if (e.type === 'tool') name = `tool:${e.name}:${e.status}`
    else if (e.type === 'message') name = `message:${e.message.role}${e.message.kind ? `:${e.message.kind}` : ''}`
    else if (e.type === 'done') name = `done:${e.stopReason}`
    else if (e.type === 'error') name = `error:${e.code}`
    else name = e.type
    if (name === 'text' && out.at(-1) === 'text') continue
    out.push(name)
  }
  return out
}
const textOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
const lastOf = (events: AiStreamEvent[]) => {
  const last = events.at(-1)
  return last?.type === 'done' ? `done:${last.stopReason}` : last?.type === 'error' ? `error:${last.code}` : last?.type
}
const messagesOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'message' ? [e.message] : []))

/** Every tool call that started has a final status, and it comes before the turn's last event. */
function assertToolsSettled(events: AiStreamEvent[]) {
  const end = events.findIndex((e) => e.type === 'done' || e.type === 'error')
  assert.ok(end >= 0, 'the turn ends with done or error')
  events.forEach((event, i) => {
    if (event.type !== 'tool' || event.status !== 'running') return
    const final = events.findIndex((e, j) => j > i && e.type === 'tool' && e.callId === event.callId && e.status !== 'running')
    assert.ok(final > i && final < end, `call ${event.callId} gets a final status before the turn ends`)
  })
}
/** An adapter that starts one tool call, then yields `tail`. */
const started = (tail: AiModelEvent[]): AiAdapter => ({
  ...fakeAdapter(),
  async *stream() {
    yield { type: 'toolStart', id: 'c1', name: 'applyOperations' }
    yield* tail
  },
})
const chips = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'tool' ? [`${e.callId}:${e.status}`] : []))

describe('runAgent with the fake adapter', () => {
  it('streams a text-only reply and stores it with the identity', async () => {
    const { events } = await run(steps({ content: [{ type: 'text', text: 'Hello there, this is a reply.' }] }))
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'message:assistant', 'done:end_turn'])
    assert.equal(textOf(events), 'Hello there, this is a reply.')
    assert.ok(messagesOf(events).every((m) => m.provider === 'fake:scripted'))
    const done = events.at(-1)
    assert.ok(done?.type === 'done' && done.usage?.inputTokens === 100)
  })

  it('runs a tool round: operations, chips, tool results, then the final text', async () => {
    const { events, workspace } = await run(
      steps(
        { content: [{ type: 'text', text: 'Adding it.' }, { type: 'tool_use', id: 'c1', name: 'insertSection', input: { sectionId: 'hero', index: 0 } }] },
        { content: [{ type: 'text', text: 'Done.' }] },
      ),
    )
    assert.deepEqual(shape(events), [
      'message:user:context',
      'text',
      'tool:insertSection:running',
      'message:assistant',
      'operations',
      'tool:insertSection:done',
      'message:user:tool_results',
      'text',
      'message:assistant',
      'done:end_turn',
    ])
    // A new step's text starts a new paragraph.
    assert.equal(textOf(events), 'Adding it.\n\nDone.')
    assert.equal(workspace.layout.blocks.length, 2)
    const results = messagesOf(events)[2].content as Array<Record<string, unknown>>
    assert.equal(results[0].tool_use_id, 'c1')
    const done = events.at(-1)
    assert.ok(done?.type === 'done' && done.usage?.inputTokens === 200 && done.usage.outputTokens === 40)
  })

  it('plays the demo script: list sections, insert a hero, change its heading', async () => {
    const { events, workspace } = await run(fakeAdapter({ delayMs: 0 }))
    const tools = events.flatMap((e) => (e.type === 'tool' && e.status === 'done' ? [e.name] : []))
    assert.deepEqual(tools, ['listSections', 'insertSection', 'applyOperations'])
    const ops = events.flatMap((e) => (e.type === 'operations' ? e.ops.map((op) => op.type) : []))
    assert.deepEqual(ops, ['insert', 'update'])
    const first = workspace.layout.blocks[0]
    assert.equal(first.type, 'stack')
    const heading = first.slots?.children?.[0]
    assert.ok(heading && findBlock(workspace.layout, heading.id)?.props?.text === 'Built with the AI assistant')
    assert.ok(events.at(-1)?.type === 'done')
  })

  it('does not run a call whose arguments could not be read', async () => {
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream() {
        yield { type: 'toolCall', id: 'c1', name: 'applyOperations', input: {}, error: 'Not valid JSON.' }
        yield { type: 'done', stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'applyOperations', input: {} }] }
      },
    }
    const { events } = await run(adapter, { maxSteps: 1 })
    const chip = events.find((e) => e.type === 'tool' && e.status === 'error')
    assert.ok(chip?.type === 'tool' && /could not be read/.test(chip.summary))
    const results = messagesOf(events).find((m) => m.kind === 'tool_results')?.content as Array<Record<string, unknown>>
    assert.equal(results[0].is_error, true)
    assert.match(String(results[0].content), /Not valid JSON/)
  })

  it('takes tool calls from the content when the adapter yields no toolCall events', async () => {
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream(request) {
        const round = request.messages.at(-1)?.kind === 'tool_results'
        yield round
          ? { type: 'done', stopReason: 'end_turn', content: [{ type: 'text', text: 'Ok.' }] }
          : { type: 'done', stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'getLayout', input: {} }] }
      },
    }
    const { events } = await run(adapter)
    assert.ok(events.some((e) => e.type === 'tool' && e.name === 'getLayout' && e.status === 'done'))
    assert.equal(events.at(-1)?.type, 'done')
  })

  it('adds a tool_use block for a toolCall missing from the content', async () => {
    let call = 0
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream() {
        if (call++ > 0) {
          yield { type: 'done', stopReason: 'end_turn', content: [] }
          return
        }
        yield { type: 'toolCall', id: 'c9', name: 'getLayout', input: {} }
        yield { type: 'done', stopReason: 'tool_use', content: [] }
      },
    }
    const { events } = await run(adapter)
    const assistant = messagesOf(events).find((m) => m.role === 'assistant')
    assert.deepEqual(assistant?.content, [{ type: 'tool_use', id: 'c9', name: 'getLayout', input: {} }])
  })

  it('calls the model again after invalid_output, at most twice', async () => {
    const invalid: FakeStep = { type: 'error', code: 'invalid_output', message: 'Bad tool input.' }
    const ok = await run(steps(invalid, { content: [{ type: 'text', text: 'Fine.' }] }))
    assert.equal(ok.events.at(-1)?.type, 'done')
    const failed = await run(steps(invalid, invalid, invalid))
    assert.deepEqual(shape(failed.events), ['error:api_error'])
  })

  it('maps adapter error codes to stream error codes', async () => {
    const cases: Array<[AiModelEvent & { type: 'error' }, string]> = [
      [{ type: 'error', code: 'auth', message: 'No key.' }, 'no_api_key'],
      [{ type: 'error', code: 'api_error', message: 'Boom.' }, 'api_error'],
      [{ type: 'error', code: 'aborted', message: 'Stop.' }, 'aborted'],
    ]
    for (const [event, code] of cases) {
      const { events } = await run(steps(event))
      assert.deepEqual(events, [{ type: 'error', code, message: event.message }])
    }
  })

  it('turns a thrown error into api_error', async () => {
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      // oxlint-disable-next-line require-yield
      async *stream() {
        throw new Error('socket hang up')
      },
    }
    const { events } = await run(adapter)
    assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: 'socket hang up' }])
  })

  it('reports a stream that ends without done', async () => {
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream() {
        yield { type: 'text', text: 'Half' }
      },
    }
    const { events } = await run(adapter)
    assert.ok(events.at(-1)?.type === 'error')
  })

  it('shows a refusal and runs no tools', async () => {
    const { events, workspace } = await run(
      steps({ content: [{ type: 'tool_use', id: 'c1', name: 'insertSection', input: { sectionId: 'hero' } }], refusal: { explanation: 'Not allowed.' } }),
    )
    assert.match(textOf(events), /can’t help with that request\. Not allowed\./)
    assert.equal(lastOf(events), 'done:refusal')
    assert.equal(workspace.layout.blocks.length, 1)
    assert.equal(events.some((e) => e.type === 'operations'), false)
  })

  it('does not run tool calls cut off at max_tokens', async () => {
    const { events, workspace } = await run(
      steps({ content: [{ type: 'tool_use', id: 'c1', name: 'insertSection', input: { sectionId: 'hero' } }], stopReason: 'max_tokens' }),
    )
    assert.equal(workspace.layout.blocks.length, 1)
    assert.match(textOf(events), /length limit before the change was complete/)
    assert.equal(lastOf(events), 'done:max_tokens')
  })

  it('continues after pause_turn', async () => {
    const { events } = await run(steps({ content: [{ type: 'text', text: 'Part one.' }], stopReason: 'pause_turn' }, { content: [{ type: 'text', text: 'Part two.' }] }))
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'message:assistant', 'text', 'message:assistant', 'done:end_turn'])
  })

  it('stops after maxSteps', async () => {
    const { events } = await run(fakeAdapter({ steps: () => readLayout }), { maxSteps: 2 })
    assert.match(textOf(events), /Stopped after 2 steps/)
    assert.equal(lastOf(events), 'done:max_steps')
  })

  it('stops when the signal aborts mid-stream', async () => {
    const controller = new AbortController()
    const adapter = steps(() => {
      queueMicrotask(() => controller.abort())
      return { content: [{ type: 'text', text: 'a long reply that keeps going and going' }] }
    })
    const { events } = await run(adapter, { signal: controller.signal })
    assert.equal(lastOf(events), 'error:aborted')
  })

  it('cancels a started call that the final reply dropped, and runs the rest', async () => {
    // Like the Anthropic refusal fallback: c_old streamed, then the final content holds only c_new.
    let call = 0
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream() {
        if (call++ > 0) {
          yield { type: 'done', stopReason: 'end_turn', content: [{ type: 'text', text: 'Ok.' }] }
          return
        }
        yield { type: 'toolStart', id: 'c_old', name: 'insertSection' }
        yield { type: 'toolStart', id: 'c_new', name: 'getLayout' }
        yield { type: 'toolCall', id: 'c_new', name: 'getLayout', input: {} }
        yield { type: 'done', stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'c_new', name: 'getLayout', input: {} }] }
      },
    }
    const { events, workspace } = await run(adapter)
    assert.deepEqual(chips(events), ['c_old:running', 'c_new:running', 'c_old:cancelled', 'c_new:done'])
    const cancelled = events.find((e) => e.type === 'tool' && e.status === 'cancelled')
    assert.ok(cancelled?.type === 'tool' && cancelled.name === 'insertSection' && cancelled.summary === NOT_RUN.dropped)
    assert.equal(workspace.layout.blocks.length, 1, 'the dropped insertSection did not run')
    assertToolsSettled(events)
    assert.equal(lastOf(events), 'done:end_turn')
  })

  it('cancels a dropped call when the reply has no calls left', async () => {
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream() {
        yield { type: 'toolStart', id: 'c1', name: 'insertSection' }
        yield { type: 'text', text: 'Here is my answer instead.' }
        yield { type: 'done', stopReason: 'end_turn', content: [{ type: 'text', text: 'Here is my answer instead.' }] }
      },
    }
    const { events } = await run(adapter)
    assert.deepEqual(chips(events), ['c1:running', 'c1:cancelled'])
    assertToolsSettled(events)
  })

  it('cancels started calls on a refusal', async () => {
    const { events } = await run(
      steps({ content: [{ type: 'tool_use', id: 'c1', name: 'insertSection', input: { sectionId: 'hero' } }], refusal: { explanation: null } }),
    )
    assert.deepEqual(chips(events), ['c1:running', 'c1:cancelled'])
    const cancelled = events.find((e) => e.type === 'tool' && e.status === 'cancelled')
    assert.ok(cancelled?.type === 'tool' && cancelled.summary === NOT_RUN.declined)
    assertToolsSettled(events)
  })

  it('cancels started calls on an error, a stream without done, and a stop', async () => {
    const failed = await run(started([{ type: 'error', code: 'api_error', message: 'Boom.' }]))
    assert.deepEqual(chips(failed.events), ['c1:running', 'c1:cancelled'])
    assert.equal(lastOf(failed.events), 'error:api_error')
    assertToolsSettled(failed.events)

    const cut = await run(started([]))
    assert.deepEqual(chips(cut.events), ['c1:running', 'c1:cancelled'])
    assertToolsSettled(cut.events)

    const controller = new AbortController()
    const stopped = await run(
      {
        ...fakeAdapter(),
        async *stream() {
          yield { type: 'toolStart', id: 'c1', name: 'applyOperations' }
          controller.abort()
          yield { type: 'text', text: 'more' }
        },
      },
      { signal: controller.signal },
    )
    assert.equal(lastOf(stopped.events), 'error:aborted')
    const cancelled = stopped.events.find((e) => e.type === 'tool' && e.status === 'cancelled')
    assert.ok(cancelled?.type === 'tool' && cancelled.summary === NOT_RUN.stopped)
    assertToolsSettled(stopped.events)
  })

  it('cancels the calls of an attempt that failed with invalid_output', async () => {
    let call = 0
    const adapter: AiAdapter = {
      ...fakeAdapter(),
      async *stream() {
        if (call++ === 0) {
          yield { type: 'toolStart', id: 'c_bad', name: 'applyOperations' }
          yield { type: 'error', code: 'invalid_output', message: 'Bad tool input.' }
          return
        }
        yield { type: 'done', stopReason: 'end_turn', content: [{ type: 'text', text: 'Fine.' }] }
      },
    }
    const { events } = await run(adapter)
    assert.deepEqual(chips(events), ['c_bad:running', 'c_bad:cancelled'])
    assertToolsSettled(events)
    assert.equal(lastOf(events), 'done:end_turn')
  })

  it('a tool that throws fails alone', async () => {
    class BrokenWorkspace extends Workspace {
      override get view(): Layout {
        throw new Error('db down')
      }
    }
    const events: AiStreamEvent[] = []
    await runAgent({
      adapter: steps({ content: [{ type: 'tool_use', id: 'c1', name: 'getLayout', input: {} }] }, { content: [{ type: 'text', text: 'Sorry.' }] }),
      system: [{ text: 'SYSTEM' }],
      tools: toolDefinitions(env),
      maxSteps: 6,
      messages: [userMessage],
      context,
      workspace: new BrokenWorkspace(structuredClone(startLayout), blocks),
      env,
      emit: (event) => events.push(event),
    })
    assert.deepEqual(chips(events), ['c1:running', 'c1:error'])
    const results = messagesOf(events).find((m) => m.kind === 'tool_results')?.content as Array<Record<string, unknown>>
    assert.match(String(results[0].content), /db down/)
    assertToolsSettled(events)
    assert.equal(lastOf(events), 'done:end_turn')
  })

  it('adapterIdentity is name:model', () => {
    assert.equal(adapterIdentity({ name: 'openrouter', model: 'openai/gpt-6-luna' }), 'openrouter:openai/gpt-6-luna')
  })
})
