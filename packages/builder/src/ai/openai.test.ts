import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import { createFakeChatFetch, demoScript, type FakeChatStep } from './fake'
import { runAgent } from './loop'
import { openAiAdapter, OpenAiApiError, parseArguments, toChatMessages } from './openai'
import { openAiTools, portableSchema, repairOperations, Workspace, type ToolEnv } from './tools'
import type { AiMessage, AiStreamEvent } from './types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true }] },
]
const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  blocks: [{ id: 'sec', type: 'stack', slots: { children: [{ id: 'title', type: 'heading', props: { text: 'Welcome' } }] } }],
}
const env: ToolEnv = {
  blocks,
  sections: [hero],
  bindingSources: null,
  searchMedia: async (query) => [{ id: 9, alt: `A ${query}`, filename: 'team.jpg', url: '/media/team.jpg', width: 800, height: 600 }],
}
const startLayout: Layout = { version: 1, blocks: [{ id: 'b_intro', type: 'heading', props: { text: 'Intro' } }] }
const userMessage: AiMessage = { role: 'user', content: 'Add a hero' }
const context: AiMessage = { role: 'user', kind: 'context', content: [{ type: 'text', text: '<editor_context>…</editor_context>' }] }

const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const usageFrame = (usage: Record<string, unknown>) => `data: ${JSON.stringify({ choices: [], usage })}\n\n`
const DONE = 'data: [DONE]\n\n'

async function run(steps: FakeChatStep[], options: { messages?: AiMessage[]; signal?: AbortSignal; sleeps?: number[]; onText?: () => void } = {}) {
  const { fetch, calls } = createFakeChatFetch(steps)
  const events: AiStreamEvent[] = []
  const workspace = new Workspace(structuredClone(startLayout), blocks)
  const sleeps = options.sleeps ?? []
  await runAgent({
    adapter: openAiAdapter({
      url: 'https://api.example.test/v1/chat/completions',
      headers: { Authorization: 'Bearer test-key' },
      label: 'Example',
      keyHint: 'Set EXAMPLE_KEY.',
      model: 'example/model',
      system: 'SYSTEM',
      tools: openAiTools(env),
      identity: 'openai-compatible:example/model',
      fetch,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    }),
    maxSteps: 6,
    messages: options.messages ?? [userMessage],
    context,
    workspace,
    env,
    emit: (event) => {
      events.push(event)
      if (event.type === 'text') options.onText?.()
    },
    signal: options.signal,
    turnId: 'turn_1',
  })
  return { events, calls, workspace, sleeps }
}

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
const messagesOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'message' ? [e.message] : []))

describe('openAiAdapter', () => {
  it('streams text, sends the request shape, and reads usage', async () => {
    const { events, calls } = await run([
      { sse: [frame({ role: 'assistant', content: '' }), frame({ content: 'Hello' }), frame({ content: ' there.' }), frame({}, 'stop'), usageFrame({ prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1000 }, cost: 0.0004 }), DONE] },
    ])
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'message:assistant', 'done:end_turn'])
    assert.equal(textOf(events), 'Hello there.')
    const done = events.at(-1)
    assert.ok(done?.type === 'done')
    assert.deepEqual(done.usage, { inputTokens: 1200, outputTokens: 30, cachedTokens: 1000, cost: 0.0004 })
    // Stored messages carry the provider identity.
    assert.ok(messagesOf(events).every((m) => m.provider === 'openai-compatible:example/model'))
    assert.deepEqual(messagesOf(events)[1].content, [{ type: 'text', text: 'Hello there.' }])

    const { url, headers, body } = calls[0]
    assert.equal(url, 'https://api.example.test/v1/chat/completions')
    assert.equal(headers.Authorization, 'Bearer test-key')
    assert.equal(body.model, 'example/model')
    assert.equal(body.stream, true)
    assert.equal(body.tool_choice, 'auto')
    assert.deepEqual(body.stream_options, { include_usage: true })
    assert.equal('max_tokens' in body, false)
    assert.deepEqual(body.messages, [
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'Add a hero' },
      { role: 'user', content: '<editor_context>…</editor_context>' },
    ])
    const tools = body.tools as Array<{ type: string; function: { name: string; parameters: Record<string, unknown> } }>
    assert.ok(tools.every((t) => t.type === 'function'))
    assert.ok(tools.some((t) => t.function.name === 'applyOperations'))
    assert.doesNotMatch(JSON.stringify(tools), /additionalProperties|"const"|eager_input_streaming|"strict"/)
  })

  it('runs one tool call with fragmented arguments, then answers', async () => {
    const { events, calls, workspace } = await run([
      {
        sse: [
          frame({ content: 'Adding a hero.' }),
          frame({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'insertSection', arguments: '' } }] }),
          frame({ tool_calls: [{ index: 0, function: { arguments: '{"sectionId"' } }] }),
          frame({ tool_calls: [{ index: 0, function: { arguments: ':"hero","ind' } }] }),
          frame({ tool_calls: [{ index: 0, function: { arguments: 'ex":0}' } }] }),
          frame({}, 'tool_calls'),
          DONE,
        ],
      },
      { content: [{ type: 'text', text: 'Added the hero.' }], stop_reason: 'end_turn' },
    ])
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
    assert.equal(textOf(events), 'Adding a hero.\n\nAdded the hero.')
    assert.equal(workspace.layout.blocks.length, 2)
    // Second request: assistant tool_calls, then a `tool` message with the result.
    const messages = calls[1].body.messages as Array<Record<string, unknown>>
    const assistant = messages[3]
    assert.equal(assistant.role, 'assistant')
    assert.equal(assistant.content, 'Adding a hero.')
    assert.deepEqual(assistant.tool_calls, [{ id: 'call_1', type: 'function', function: { name: 'insertSection', arguments: '{"sectionId":"hero","index":0}' } }])
    assert.equal(messages[4].role, 'tool')
    assert.equal(messages[4].tool_call_id, 'call_1')
    assert.match(String(messages[4].content), /"inserted"/)
  })

  it('accumulates parallel tool calls by index, interleaved', async () => {
    const { events, calls } = await run([
      {
        sse: [
          frame({ tool_calls: [{ index: 0, id: 'call_a', function: { name: 'searchMedia', arguments: '{"que' } }, { index: 1, id: 'call_b', function: { name: 'findBlocks', arguments: '' } }] }),
          frame({ tool_calls: [{ index: 1, function: { arguments: '{"type":"head' } }] }),
          frame({ tool_calls: [{ index: 0, function: { arguments: 'ry":"team"}' } }] }),
          frame({ tool_calls: [{ index: 1, function: { arguments: 'ing"}' } }] }),
          frame({}, 'tool_calls'),
          DONE,
        ],
      },
      { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
    ])
    assert.deepEqual(shape(events).slice(0, 7), [
      'message:user:context',
      'tool:searchMedia:running',
      'tool:findBlocks:running',
      'message:assistant',
      'tool:searchMedia:done',
      'tool:findBlocks:done',
      'message:user:tool_results',
    ])
    const messages = calls[1].body.messages as Array<Record<string, unknown>>
    assert.deepEqual(
      messages.slice(4).map((m) => [m.role, m.tool_call_id]),
      [
        ['tool', 'call_a'],
        ['tool', 'call_b'],
      ],
    )
    assert.match(String(messages[4].content), /team\.jpg/)
    assert.match(String(messages[5].content), /b_intro/)
  })

  it('answers invalid JSON arguments with an error tool result and does not run the tool', async () => {
    const { events, calls, workspace } = await run([
      {
        sse: [
          frame({ tool_calls: [{ index: 0, id: 'call_x', function: { name: 'applyOperations', arguments: '{"operations":[{"type":"remove",' } }] }),
          frame({}, 'tool_calls'),
          DONE,
        ],
      },
      { content: [{ type: 'text', text: 'Sorry.' }], stop_reason: 'end_turn' },
    ])
    assert.ok(shape(events).includes('tool:applyOperations:error'))
    assert.equal(events.some((e) => e.type === 'operations'), false)
    assert.equal(workspace.layout.blocks.length, 1)
    const result = (calls[1].body.messages as Array<Record<string, unknown>>)[4]
    assert.equal(result.role, 'tool')
    assert.match(String(result.content), /not valid JSON/)
    // The stored call has an object input, so the history replays cleanly.
    const assistant = (calls[1].body.messages as Array<Record<string, unknown>>)[3]
    assert.deepEqual(assistant.tool_calls, [{ id: 'call_x', type: 'function', function: { name: 'applyOperations', arguments: '{}' } }])
  })

  it('stops on abort mid-stream without storing a partial message', async () => {
    const controller = new AbortController()
    const { events, calls } = await run(
      [{ sse: [frame({ content: 'A long' }), frame({ content: ' answer' }), frame({ content: ' cut off.' }), frame({}, 'stop'), DONE] }],
      { signal: controller.signal, onText: () => controller.abort() },
    )
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'error:aborted'])
    assert.equal(calls.length, 1)
  })

  it('maps 401 to no_api_key with the provider message and the key hint', async () => {
    const { events, calls } = await run([{ status: 401, body: { error: { message: 'User not found.', code: 401 } } }])
    assert.equal(calls.length, 1, '401 is not retried')
    assert.deepEqual(events, [{ type: 'error', code: 'no_api_key', message: 'Example rejected the API key (401): User not found. Set EXAMPLE_KEY.' }])
  })

  it('retries 429 and 5xx with backoff, honoring Retry-After', async () => {
    const { events, calls, sleeps } = await run([
      { status: 429, body: { error: { message: 'Rate limited' } }, headers: { 'retry-after': '3' } },
      { status: 503, body: { error: { message: 'Overloaded' } } },
      { content: [{ type: 'text', text: 'Hi.' }], stop_reason: 'end_turn' },
    ])
    assert.equal(calls.length, 3)
    assert.deepEqual(sleeps, [3000, 2000])
    assert.equal(shape(events).at(-1), 'done:end_turn')
  })

  it('gives up after the retries with the provider message', async () => {
    const busy = { status: 429, body: { error: { message: 'Slow down' } } }
    const { events, calls } = await run([busy, busy, busy, busy])
    assert.equal(calls.length, 3)
    assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: 'Example rate limit reached (429): Slow down. Wait a moment and try again.' }])
  })

  it('drops stream_options once when the server rejects it', async () => {
    const { calls, events } = await run([
      { status: 400, body: { error: { message: 'Unrecognized request argument supplied: stream_options' } } },
      { content: [{ type: 'text', text: 'Hi.' }], stop_reason: 'end_turn' },
    ])
    assert.equal(calls.length, 2)
    assert.equal('stream_options' in calls[1].body, false)
    assert.equal(shape(events).at(-1), 'done:end_turn')
  })

  it('reports a mid-stream error', async () => {
    const { events } = await run([
      { sse: [frame({ content: 'Partial' }), `data: ${JSON.stringify({ error: { code: 502, message: 'Provider disconnected' }, choices: [{ index: 0, delta: {}, finish_reason: 'error' }] })}\n\n`] },
    ])
    assert.deepEqual(events.at(-1), { type: 'error', code: 'api_error', message: 'Example returned an error (502): Provider disconnected' })
  })

  it('keeps reasoning fields in the stored message and sends them back, without rendering them', async () => {
    const details = [{ type: 'reasoning.encrypted', data: 'abc', index: 0 }]
    const { events, calls } = await run([
      {
        sse: [
          frame({ reasoning: 'Let me ', reasoning_details: [{ type: 'reasoning.text', text: 'Let me ', index: 0 }] }),
          frame({ reasoning: 'think.', reasoning_details: [{ type: 'reasoning.text', text: 'think.', index: 0 }] }),
          frame({ reasoning_details: details }),
          frame({ tool_calls: [{ index: 0, id: 'call_r', function: { name: 'getLayout', arguments: '{}' } }] }),
          frame({}, 'tool_calls'),
          DONE,
        ],
      },
      { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
    ])
    assert.equal(textOf(events), 'Done.')
    const stored = messagesOf(events)[1].content as Array<Record<string, unknown>>
    assert.equal(stored[0].type, 'reasoning')
    assert.equal(stored[0].reasoning, 'Let me think.')
    assert.deepEqual(stored[0].reasoning_details, [{ type: 'reasoning.text', text: 'Let me think.', index: 0 }, { type: 'reasoning.encrypted', data: 'abc', index: 0 }])
    const assistant = (calls[1].body.messages as Array<Record<string, unknown>>)[3]
    assert.equal(assistant.reasoning, 'Let me think.')
    assert.deepEqual(assistant.reasoning_details, stored[0].reasoning_details)
  })

  it('runs the BUILDER_AI_FAKE demo script over the fake fetch', async () => {
    const script = demoScript([hero])
    const { events, workspace } = await run([script, script, script])
    const ops = events.flatMap((e) => (e.type === 'operations' ? e.ops : []))
    assert.deepEqual(ops.map((op) => op.type), ['insert', 'update'])
    assert.equal(workspace.layout.blocks[0].slots?.children?.[0]?.props?.text, 'Built with the AI assistant')
    assert.equal(shape(events).at(-1), 'done:end_turn')
  })

  it('maps a network failure after the retries to api_error', async () => {
    const { events, calls } = await run([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')])
    assert.equal(calls.length, 3)
    assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: 'Could not reach Example: fetch failed.' }])
  })
})

describe('toChatMessages', () => {
  it('converts stored blocks (both adapters) to Chat Completions messages', () => {
    const history: AiMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Hello' }, { type: 'tool_use', id: 't1', name: 'getLayout', input: {} }] },
      { role: 'user', kind: 'tool_results', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"layout":{}}', is_error: false }] },
      { role: 'assistant', content: [{ type: 'text', text: '(Stopped.)' }] },
    ]
    assert.deepEqual(toChatMessages('S', history), [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello', tool_calls: [{ id: 't1', type: 'function', function: { name: 'getLayout', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't1', content: '{"layout":{}}' },
      { role: 'assistant', content: '(Stopped.)' },
    ])
  })
})

describe('parseArguments', () => {
  it('reads empty, fenced and double-encoded arguments', () => {
    assert.deepEqual(parseArguments(''), { input: {} })
    assert.deepEqual(parseArguments('```json\n{"a":1}\n```'), { input: { a: 1 } })
    assert.deepEqual(parseArguments('"{\\"a\\":1}"'), { input: { a: 1 } })
    assert.ok('error' in parseArguments('[1,2]'))
    assert.ok('error' in parseArguments('{"a":'))
  })
})

describe('OpenAiApiError', () => {
  it('keeps status and kind', () => {
    const error = new OpenAiApiError('x', { status: 500, kind: 'http' })
    assert.equal(error.status, 500)
    assert.equal(error.kind, 'http')
  })
})

describe('portableSchema', () => {
  it('removes type arrays, const and additionalProperties', () => {
    assert.deepEqual(
      portableSchema({ type: 'object', additionalProperties: false, properties: { a: { type: ['string', 'null'] }, b: { const: 'x' } } }),
      { type: 'object', properties: { a: { type: 'string' }, b: { enum: ['x'] } } },
    )
  })
})

describe('repairOperations', () => {
  it('fixes common mistakes of smaller models and says what it fixed', () => {
    const result = repairOperations({
      operations: JSON.stringify([
        { op: 'insert', block: '{"type":"heading","props":{"text":"Hi"}}', parentId: 'root', index: '0' },
        { type: 'Update', id: 'b_1', className: ['text-xl', 'font-bold'] },
      ]),
    })
    assert.ok(typeof result !== 'string')
    assert.deepEqual(result.ops, [
      { type: 'insert', block: { type: 'heading', props: { text: 'Hi' } }, to: { parentId: null, index: 0 } },
      { type: 'update', id: 'b_1', className: 'text-xl font-bold' },
    ])
    assert.ok(result.notes.some((n) => /JSON string/.test(n)))
    assert.ok(result.notes.some((n) => /inside "to"/.test(n)))
  })

  it('wraps a single operation and rejects a missing list', () => {
    const single = repairOperations({ type: 'remove', id: 'b_1' })
    assert.ok(typeof single !== 'string')
    assert.deepEqual(single.ops, [{ type: 'remove', id: 'b_1' }])
    assert.match(String(repairOperations({})), /must be a non-empty array/)
  })
})
