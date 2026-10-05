import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { APIUserAbortError } from '@anthropic-ai/sdk'

import type { BlockDefinition, Layout, SectionDefinition } from '../../core/types'
import { NOT_RUN, runAgent } from '../loop'
import { toolDefinitions, Workspace, type ToolEnv } from '../tools'
import type { AiMessage, AiModelEvent, AiModelRequest, AiStreamEvent } from '../types'
import { AI_BETAS, anthropicAdapter, anthropicTools, NO_KEY_MESSAGE, sanitizeFallback, toParam } from './anthropic'
import {
  createFakeClient,
  RECORDED_TEXT_DELTAS,
  RECORDED_TOOL_INPUT,
  recordedMessage,
  recordedReply,
  type FakeBlock,
  type FakeStep,
} from './anthropic.test-data'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} }, ai: { description: 'A container.' } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true }] },
]

const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  category: 'Heroes',
  blocks: [{ id: 'sec', type: 'stack', slots: { children: [{ id: 'title', type: 'heading', props: { text: 'Welcome' } }] } }],
}

const env: ToolEnv = { blocks, sections: [hero], bindingSources: null, searchMedia: async () => [] }
const tools = toolDefinitions(env)

const startLayout: Layout = { version: 1, blocks: [{ id: 'b_intro', type: 'heading', props: { text: 'Intro' } }] }
const userMessage: AiMessage = { role: 'user', content: 'Add a hero' }
const context: AiMessage = { role: 'user', kind: 'context', content: [{ type: 'text', text: '<editor_context>x</editor_context>' }] }
const thinking: FakeBlock = { type: 'thinking', thinking: '', signature: 'sig-1' }
const IDENTITY = 'anthropic:claude-opus-5-5'

const request = (over: Partial<AiModelRequest> = {}): AiModelRequest => ({
  system: [{ text: 'SYSTEM A' }, { text: 'SYSTEM B' }],
  messages: [userMessage],
  tools,
  ...over,
})

async function collect(iterable: AsyncIterable<AiModelEvent>): Promise<AiModelEvent[]> {
  const out: AiModelEvent[] = []
  for await (const event of iterable) out.push(event)
  return out
}

/** Runs one adapter call against scripted steps. */
async function callAdapter(steps: FakeStep[], over: Partial<AiModelRequest> = {}, adapterOptions: Parameters<typeof anthropicAdapter>[0] = {}, clientOptions: Parameters<typeof createFakeClient>[1] = {}) {
  const { client, calls } = createFakeClient(steps, clientOptions)
  const events = await collect(anthropicAdapter({ client, ...adapterOptions }).stream(request(over)))
  return { events, calls }
}

const ok = (content: FakeBlock[], stop_reason: 'end_turn' | 'tool_use' = 'end_turn') => ({ content, stop_reason })

async function run(steps: FakeStep[], clientOptions: Parameters<typeof createFakeClient>[1] = {}, controller?: AbortController) {
  const { client, calls } = createFakeClient(steps, clientOptions)
  const events: AiStreamEvent[] = []
  const workspace = new Workspace(structuredClone(startLayout), blocks)
  await runAgent({
    adapter: anthropicAdapter({ client }),
    system: [{ text: 'SYSTEM' }],
    tools,
    maxSteps: 6,
    messages: [userMessage],
    context,
    workspace,
    env,
    emit: (event) => events.push(event),
    signal: controller?.signal,
    turnId: 'turn_1',
  })
  return { events, calls, workspace }
}

const messagesOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'message' ? [e.message] : []))


describe('anthropic adapter: request building', () => {
  it('builds the request with cached system, tools, adaptive thinking and defaults', async () => {
    const { calls } = await callAdapter([ok([{ type: 'text', text: 'Hi' }])])
    const params = calls[0]
    assert.equal(params.model, 'claude-opus-5-5')
    assert.equal(params.max_tokens, 32000)
    assert.deepEqual(params.system, [{ type: 'text', text: 'SYSTEM A\n\nSYSTEM B', cache_control: { type: 'ephemeral' } }])
    assert.deepEqual(params.cache_control, { type: 'ephemeral' })
    assert.deepEqual(params.thinking, { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } })
    assert.deepEqual(params.output_config, { effort: 'medium' })
    assert.equal(params.tool_choice, undefined)
  })

  it('maps tool definitions with eager input streaming and keeps strict', async () => {
    const { calls } = await callAdapter([ok([{ type: 'text', text: 'Hi' }])])
    const sent = (calls[0].tools ?? []) as unknown as Array<Record<string, unknown>>
    assert.equal(sent.length, tools.length)
    assert.ok(tools.some((t) => t.strict) && tools.some((t) => !t.strict), 'the catalog has strict and non-strict tools')
    tools.forEach((tool, i) => {
      assert.equal(sent[i].name, tool.name)
      assert.equal(sent[i].description, tool.description)
      assert.deepEqual(sent[i].input_schema, tool.inputSchema)
      assert.equal(sent[i].eager_input_streaming, true)
      assert.equal('strict' in sent[i] ? sent[i].strict : undefined, tool.strict ? true : undefined)
    })
    assert.deepEqual(anthropicTools([{ name: 'a', description: 'd', inputSchema: { type: 'object' } }]), [
      { name: 'a', description: 'd', input_schema: { type: 'object' }, eager_input_streaming: true },
    ])
  })

  it('passes the effort of the request through, default medium', async () => {
    const high = await callAdapter([ok([{ type: 'text', text: 'Hi' }])], { effort: 'xhigh' })
    assert.deepEqual(high.calls[0].output_config, { effort: 'xhigh' })
    const none = await callAdapter([ok([{ type: 'text', text: 'Hi' }])])
    assert.deepEqual(none.calls[0].output_config, { effort: 'medium' })
  })

  it('turns on betas and fallbacks by default for claude-opus-5-5 only', async () => {
    const opus = await callAdapter([ok([{ type: 'text', text: 'Hi' }])])
    assert.deepEqual(opus.calls[0].betas, [AI_BETAS.fallback, AI_BETAS.thinkingBinding])
    assert.equal(opus.calls[0].fallbacks, 'default')

    const other = await callAdapter([ok([{ type: 'text', text: 'Hi' }])], {}, { model: 'claude-sonnet-5' })
    assert.equal(other.calls[0].model, 'claude-sonnet-5')
    assert.deepEqual(other.calls[0].betas, [AI_BETAS.thinkingBinding])
    assert.equal('fallbacks' in other.calls[0], false)

    const forced = await callAdapter([ok([{ type: 'text', text: 'Hi' }])], {}, { model: 'claude-sonnet-5', fallbacks: true })
    assert.equal(forced.calls[0].fallbacks, 'default')
    const off = await callAdapter([ok([{ type: 'text', text: 'Hi' }])], {}, { fallbacks: false })
    assert.equal('fallbacks' in off.calls[0], false)
  })

  it('uses a custom maxTokens', async () => {
    const { calls } = await callAdapter([ok([{ type: 'text', text: 'Hi' }])], {}, { maxTokens: 1234 })
    assert.equal(calls[0].max_tokens, 1234)
  })

  it('sends messages with role and content only', async () => {
    const assistant: AiMessage = { role: 'assistant', content: [thinking, { type: 'text', text: 'Hello' }], provider: IDENTITY }
    const messages: AiMessage[] = [{ ...userMessage, provider: IDENTITY }, assistant, { ...context, provider: IDENTITY }]
    const { calls } = await callAdapter([ok([{ type: 'text', text: 'Hi' }])], { messages })
    assert.deepEqual(calls[0].messages, messages.map(toParam))
    for (const message of calls[0].messages) assert.deepEqual(Object.keys(message).toSorted(), ['content', 'role'])
    assert.deepEqual(calls[0].messages[1].content, assistant.content)
  })
})

describe('anthropic adapter: stream parsing', () => {
  it('turns a recorded stream into model events', async () => {
    const { events } = await callAdapter([recordedReply])
    assert.deepEqual(
      events.map((e) => e.type),
      ['text', 'text', 'text', 'toolStart', 'usage', 'toolCall', 'done'],
    )
    assert.deepEqual(
      events.filter((e) => e.type === 'text').map((e) => e.text),
      RECORDED_TEXT_DELTAS,
    )
    assert.deepEqual(events[3], { type: 'toolStart', id: 'toolu_01Abc', name: 'insertSection' })
    // Input counts cache reads and cache writes too.
    assert.deepEqual(events[4], { type: 'usage', usage: { inputTokens: 120 + 2000 + 300, outputTokens: 85, cachedTokens: 2000 } })
    assert.deepEqual(events[5], { type: 'toolCall', id: 'toolu_01Abc', name: 'insertSection', input: RECORDED_TOOL_INPUT })
    // The stored content is the final message content unchanged: the thinking block stays.
    assert.deepEqual(events[6], { type: 'done', stopReason: 'tool_use', content: recordedMessage.content })
    const content = (events[6] as Extract<AiModelEvent, { type: 'done' }>).content
    assert.equal(content[0].type, 'thinking')
    assert.equal(content[0].signature, 'EqQBCkYIARgCKkD3signature==')
  })

  it('maps a refusal to done with refusal and no content', async () => {
    const reply = {
      content: [{ type: 'text', text: 'Let me' } as const, { type: 'tool_use', id: 'toolu_x', name: 'getLayout', input: {} } as const],
      stop_reason: 'refusal' as never,
      stop_details: { category: 'cyber', explanation: 'This request is not allowed.' },
    }
    const { events } = await callAdapter([reply])
    assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'refusal', content: [], refusal: { explanation: 'This request is not allowed.' } })
    assert.equal(events.some((e) => e.type === 'toolCall'), false)

    const bare = await callAdapter([{ content: [], stop_reason: 'refusal' as never }])
    assert.deepEqual(bare.events.at(-1), { type: 'done', stopReason: 'refusal', content: [], refusal: { explanation: null } })
  })

  it('drops thinking and tool calls from before a mid-output fallback', async () => {
    const fallback: FakeBlock = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-sonnet-5' } }
    const content: FakeBlock[] = [
      { type: 'thinking', thinking: 'old', signature: 'old-sig' },
      { type: 'text', text: 'Before.' },
      { type: 'tool_use', id: 'toolu_old', name: 'insertSection', input: { sectionId: 'hero' } },
      fallback,
      { type: 'thinking', thinking: 'new', signature: 'new-sig' },
      { type: 'text', text: 'After.' },
      { type: 'tool_use', id: 'toolu_new', name: 'getLayout', input: {} },
    ]
    const { events } = await callAdapter([ok(content, 'tool_use')])
    const calls = events.filter((e) => e.type === 'toolCall')
    assert.deepEqual(calls.map((c) => c.id), ['toolu_new'])
    const done = events.at(-1) as Extract<AiModelEvent, { type: 'done' }>
    assert.deepEqual(done.content, [content[1], fallback, content[4], content[5], content[6]])
  })

  it('sanitizeFallback keeps content without a fallback block', () => {
    const content = [{ type: 'text', text: 'a' }] as never
    assert.equal(sanitizeFallback(content), content)
  })

  it('maps stop reasons: max_tokens passes through, unknown becomes end_turn', async () => {
    const cut = await callAdapter([{ content: [{ type: 'text', text: 'Long' }], stop_reason: 'max_tokens' }])
    assert.equal((cut.events.at(-1) as Extract<AiModelEvent, { type: 'done' }>).stopReason, 'max_tokens')
    const stop = await callAdapter([{ content: [{ type: 'text', text: 'Hi' }], stop_reason: 'stop_sequence' }])
    assert.equal((stop.events.at(-1) as Extract<AiModelEvent, { type: 'done' }>).stopReason, 'end_turn')
  })
})

describe('anthropic adapter: errors', () => {
  it('reports missing credentials when the call fails before any event', async () => {
    const { events } = await callAdapter([new Error('Could not resolve authentication method.')], {}, {}, { apiKey: null })
    assert.deepEqual(events, [{ type: 'error', code: 'auth', message: NO_KEY_MESSAGE }])
  })

  it('reports a plain api_error before any event when the client has credentials', async () => {
    const { events } = await callAdapter([new Error('socket hang up')])
    assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: 'socket hang up' }])
  })

  it('reports invalid_output for a non-API error after stream events', async () => {
    const { events } = await callAdapter([recordedReply], {}, {}, {
      onEvent: (_event, index) => {
        if (index === 8) throw new SyntaxError('Unexpected end of JSON input')
      },
    })
    assert.equal(events.at(-1)?.type, 'error')
    const error = events.at(-1) as Extract<AiModelEvent, { type: 'error' }>
    assert.equal(error.code, 'invalid_output')
    assert.match(error.message, /Unexpected end of JSON input/)
    assert.equal(events.some((e) => e.type === 'done'), false)
  })

  it('reports aborted for an SDK abort error', async () => {
    const { events } = await callAdapter([new APIUserAbortError()])
    assert.deepEqual(events, [{ type: 'error', code: 'aborted', message: 'The request was cancelled.' }])
  })
})

describe('anthropic adapter: agent loop', () => {
  const step1Content: FakeBlock[] = [
    thinking,
    { type: 'text', text: 'Adding a hero.' },
    { type: 'tool_use', id: 'toolu_1', name: 'insertSection', input: { sectionId: 'hero', index: 0 } },
  ]
  const toolStep: FakeStep = {
    content: step1Content,
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
  }
  const finalStep: FakeStep = {
    content: [{ type: 'text', text: 'Added the hero.' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 5, output_tokens: 8, cache_read_input_tokens: 160 },
  }

  it('runs a tool call, streams operations, stores messages and sums usage', async () => {
    const { events, calls, workspace } = await run([toolStep, finalStep])

    assert.equal(calls.length, 2)
    assert.deepEqual(
      events.flatMap((e) => (e.type === 'tool' ? [`${e.name}:${e.status}`] : [])),
      ['insertSection:running', 'insertSection:done'],
    )
    const ops = events.find((e) => e.type === 'operations')
    assert.ok(ops && ops.type === 'operations')
    assert.equal(ops.turnId, 'turn_1')
    assert.equal(ops.ops.length, 1)
    assert.equal(workspace.layout.blocks[0].id, (ops.ops[0] as { block: { id: string } }).block.id)
    assert.equal(events.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : '')).join(''), 'Adding a hero.\n\nAdded the hero.')

    const stored = messagesOf(events)
    assert.deepEqual(
      stored.map((m) => `${m.role}${m.kind ? `:${m.kind}` : ''}`),
      ['user:context', 'assistant', 'user:tool_results', 'assistant'],
    )
    assert.ok(stored.every((m) => m.provider === IDENTITY))
    assert.deepEqual(stored[1].content, step1Content, 'the assistant content keeps the thinking block')
    const results = stored[2].content as Array<{ type: string; tool_use_id: string }>
    assert.equal(results[0].type, 'tool_result')
    assert.equal(results[0].tool_use_id, 'toolu_1')

    // The second request carries the stored content back, without kind or provider.
    const second = calls[1].messages
    assert.deepEqual(second[2], { role: 'assistant', content: step1Content })
    assert.ok(second.every((m) => Object.keys(m).toSorted().join() === 'content,role'))

    const done = events.at(-1)
    assert.deepEqual(done, { type: 'done', turnId: 'turn_1', stopReason: 'end_turn', usage: { inputTokens: 160 + 165, outputTokens: 28, cachedTokens: 210 } })
  })

  it('retries once after an invalid_output error', async () => {
    const { events, calls } = await run([toolStep, finalStep], {
      onEvent: (_event, index, call) => {
        if (call === 0 && index === 3) throw new SyntaxError('bad tool input')
      },
    })
    // Call 0 failed mid-stream, so the same step list is not replayed: call 1 gets `finalStep`.
    assert.equal(calls.length, 2)
    assert.equal(events.some((e) => e.type === 'error'), false)
    assert.equal(events.filter((e) => e.type === 'message' && e.message.kind === 'context').length, 1)
    assert.equal(events.at(-1)?.type, 'done')
    assert.equal((events.at(-1) as { stopReason: string }).stopReason, 'end_turn')
  })

  it('stops with an error after repeated invalid_output errors', async () => {
    const { events, calls } = await run([toolStep, toolStep, toolStep, toolStep], { onEvent: (_event, index) => { if (index === 3) throw new SyntaxError('bad') } })
    assert.equal(calls.length, 3, 'one call and two retries')
    const error = events.at(-1)
    assert.ok(error && error.type === 'error')
    assert.equal(error.code, 'api_error')
    assert.match(error.message, /could not be read/)
  })

  it('emits an aborted error when the signal aborts mid-stream, and stores no assistant message', async () => {
    const controller = new AbortController()
    const { events } = await run([toolStep, finalStep], { onEvent: (_event, index) => { if (index === 3) controller.abort() } }, controller)
    assert.deepEqual(events.at(-1), { type: 'error', code: 'aborted', message: 'The request was cancelled.' })
    assert.equal(messagesOf(events).some((m) => m.role === 'assistant'), false)
  })

  it('cancels the chip of a tool call dropped by a mid-reply refusal fallback', async () => {
    // The declined model streams insertSection (the panel shows a running chip), then the fallback
    // model takes over and calls getLayout. Only getLayout runs; insertSection gets "cancelled".
    const fallback: FakeBlock = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-sonnet-5' } }
    const fallbackStep: FakeStep = {
      content: [
        { type: 'text', text: 'Adding a hero.' },
        { type: 'tool_use', id: 'toolu_old', name: 'insertSection', input: { sectionId: 'hero', index: 0 } },
        fallback,
        { type: 'text', text: 'Let me read the page first.' },
        { type: 'tool_use', id: 'toolu_new', name: 'getLayout', input: {} },
      ],
      stop_reason: 'tool_use',
    }
    const { events, workspace } = await run([fallbackStep, finalStep])
    const chips = events.flatMap((e) => (e.type === 'tool' ? [`${e.callId}:${e.status}`] : []))
    assert.deepEqual(chips, ['toolu_old:running', 'toolu_new:running', 'toolu_old:cancelled', 'toolu_new:done'])
    const cancelled = events.find((e) => e.type === 'tool' && e.status === 'cancelled')
    assert.ok(cancelled?.type === 'tool' && cancelled.name === 'insertSection' && cancelled.summary === NOT_RUN.dropped)
    assert.equal(workspace.layout.blocks.length, 1, 'the dropped insertSection did not run')
    assert.equal(events.some((e) => e.type === 'operations'), false)
    assert.equal(events.at(-1)?.type, 'done')
  })

  it('cancels the chip when the fallback reply has no tool call left', async () => {
    const fallback: FakeBlock = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-sonnet-5' } }
    const { events } = await run([
      {
        content: [{ type: 'tool_use', id: 'toolu_old', name: 'insertSection', input: { sectionId: 'hero' } }, fallback, { type: 'text', text: 'I can describe it instead.' }],
        stop_reason: 'end_turn',
      },
    ])
    const chips = events.flatMap((e) => (e.type === 'tool' ? [`${e.callId}:${e.status}`] : []))
    assert.deepEqual(chips, ['toolu_old:running', 'toolu_old:cancelled'])
    assert.equal((events.at(-1) as { stopReason?: string }).stopReason, 'end_turn')
  })

  it('cancels the chip of a tool call cut off by a refusal', async () => {
    const { events } = await run([
      { content: [{ type: 'tool_use', id: 'toolu_x', name: 'insertSection', input: { sectionId: 'hero' } }], stop_reason: 'refusal' as never },
    ])
    const chips = events.flatMap((e) => (e.type === 'tool' ? [`${e.callId}:${e.status}`] : []))
    assert.deepEqual(chips, ['toolu_x:running', 'toolu_x:cancelled'])
    assert.equal((events.at(-1) as { stopReason?: string }).stopReason, 'refusal')
  })

  it('maps missing credentials to the no_api_key error', async () => {
    const { events } = await run([new Error('Could not resolve authentication method.')], { apiKey: null })
    assert.deepEqual(events, [{ type: 'error', code: 'no_api_key', message: NO_KEY_MESSAGE }])
  })
})

describe('anthropic adapter: ready', () => {
  it('is ready with an explicit key or a client', () => {
    const adapter = anthropicAdapter({ apiKey: 'x' })
    assert.equal(adapter.ready, true)
    assert.equal(adapter.setupProblem, null)
    assert.equal(adapter.name, 'anthropic')
    assert.equal(adapter.model, 'claude-opus-5-5')
    assert.equal(anthropicAdapter({ client: createFakeClient([]).client }).ready, true)
  })

  it('without a key or client, ready follows ANTHROPIC_API_KEY', () => {
    const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN }
    try {
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_AUTH_TOKEN
      const missing = anthropicAdapter()
      assert.equal(missing.ready, false)
      assert.match(missing.setupProblem ?? '', /ANTHROPIC_API_KEY/)
      assert.equal(missing.keyEnv, 'ANTHROPIC_API_KEY')

      process.env.ANTHROPIC_API_KEY = 'sk-test'
      const present = anthropicAdapter()
      assert.equal(present.ready, true)
      assert.equal(present.setupProblem, null)
    } finally {
      if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = saved.key
      if (saved.token === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
      else process.env.ANTHROPIC_AUTH_TOKEN = saved.token
    }
  })
})
