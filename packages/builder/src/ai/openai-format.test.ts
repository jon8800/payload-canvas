import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import {
  bearer,
  chatCompletionsUrl,
  chatTools,
  clean,
  createAccumulator,
  createOpenAIFormatAdapter,
  describeOpenAiError,
  OpenAiApiError,
  parseArguments,
  portableSchema,
  sleep,
  toChatMessages,
  type OpenAIFormatAdapterOptions,
} from './openai-format'
import {
  callPart,
  callStart,
  createFakeChatFetch,
  DONE_FRAME,
  IN_STREAM_ERROR_STREAM,
  OPENROUTER_EXPECTED,
  OPENROUTER_STREAM,
  sseFrame,
  usageFrame,
  WORKERS_AI_EXPECTED,
  WORKERS_AI_STREAM,
  type FakeChatStep,
} from './openai-format.test-data'
import { runAgent } from './loop'
import { repairOperations, toolDefinitions, Workspace, type ToolEnv } from './tools'
import type { AiMessage, AiModelEvent, AiModelRequest, AiStreamEvent, AiToolDefinition } from './types'

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

const URL = 'https://api.example.test/v1/chat/completions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An adapter on the fake fetch. `sleeps` records the retry delays (no real waiting). */
function makeAdapter(steps: FakeChatStep[], overrides: Partial<OpenAIFormatAdapterOptions> = {}) {
  const { fetch, calls } = createFakeChatFetch(steps)
  const sleeps: number[] = []
  const adapter = createOpenAIFormatAdapter({
    name: 'example',
    label: 'Example',
    model: 'example/model',
    url: URL,
    authHeaders: { Authorization: 'Bearer test-key' },
    keyHint: 'Set EXAMPLE_KEY.',
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    ...overrides,
  })
  return { adapter, calls, sleeps }
}

const request = (overrides: Partial<AiModelRequest> = {}): AiModelRequest => ({
  system: [{ text: 'SYSTEM' }],
  messages: [{ role: 'user', content: 'Hi' }],
  tools: [],
  ...overrides,
})

async function collect(source: AsyncIterable<AiModelEvent>): Promise<AiModelEvent[]> {
  const events: AiModelEvent[] = []
  for await (const event of source) events.push(event)
  return events
}

/** Drives the adapter directly. */
async function stream(steps: FakeChatStep[], overrides: Partial<OpenAIFormatAdapterOptions> = {}, req: Partial<AiModelRequest> = {}) {
  const made = makeAdapter(steps, overrides)
  const events = await collect(made.adapter.stream(request(req)))
  return { ...made, events }
}

const types = (events: AiModelEvent[]) => events.map((e) => e.type)
const textOf = (events: AiModelEvent[]) => events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
const doneOf = (events: AiModelEvent[]) => {
  const done = events.find((e) => e.type === 'done')
  assert.ok(done?.type === 'done', 'a done event')
  return done
}
const errorOf = (events: AiModelEvent[]) => {
  const error = events.find((e) => e.type === 'error')
  assert.ok(error?.type === 'error', 'an error event')
  return error
}
const reply = (text: string) => ({ text, finish: 'stop' })
/** The first retry delay after a 429 with these headers. */
const retryDelay = async (headers: Record<string, string>) => (await stream([{ status: 429, body: {}, headers }, reply('Hi')])).sleeps[0]
/** The error message after one HTTP error step (no retries). */
const errorMessage = async (step: FakeChatStep) => errorOf((await stream([step], { maxRetries: 0 })).events).message

// ---------------------------------------------------------------------------
// Through runAgent (ported from the old openai.test.ts)
// ---------------------------------------------------------------------------

async function run(steps: FakeChatStep[], options: { messages?: AiMessage[]; signal?: AbortSignal; sleeps?: number[]; onText?: () => void } = {}) {
  const { adapter, calls, sleeps } = makeAdapter(steps)
  const events: AiStreamEvent[] = []
  const workspace = new Workspace(structuredClone(startLayout), blocks)
  await runAgent({
    adapter,
    system: [{ text: 'SYSTEM' }],
    tools: toolDefinitions(env),
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
const streamText = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
const messagesOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'message' ? [e.message] : []))

describe('runAgent with the OpenAI-format adapter', () => {
  it('streams text, sends the request shape, and reads usage', async () => {
    const { events, calls } = await run([
      {
        sse: [
          sseFrame({ role: 'assistant', content: '' }),
          sseFrame({ content: 'Hello' }),
          sseFrame({ content: ' there.' }),
          sseFrame({}, 'stop'),
          usageFrame({ prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1000 }, cost: 0.0004 }),
          DONE_FRAME,
        ],
      },
    ])
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'message:assistant', 'done:end_turn'])
    assert.equal(streamText(events), 'Hello there.')
    const done = events.at(-1)
    assert.ok(done?.type === 'done')
    assert.deepEqual(done.usage, { inputTokens: 1200, outputTokens: 30, cachedTokens: 1000, cost: 0.0004 })
    // Stored messages carry the adapter identity.
    assert.ok(messagesOf(events).every((m) => m.provider === 'example:example/model'))
    assert.deepEqual(messagesOf(events)[1].content, [{ type: 'text', text: 'Hello there.' }])

    const { url, headers, body } = calls[0]
    assert.equal(url, URL)
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
          sseFrame({ content: 'Adding a hero.' }),
          sseFrame({ tool_calls: [callStart(0, 'call_1', 'insertSection')] }),
          sseFrame({ tool_calls: [callPart(0, '{"sectionId"')] }),
          sseFrame({ tool_calls: [callPart(0, ':"hero","ind')] }),
          sseFrame({ tool_calls: [callPart(0, 'ex":0}')] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
      reply('Added the hero.'),
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
    assert.equal(streamText(events), 'Adding a hero.\n\nAdded the hero.')
    assert.equal(workspace.layout.blocks.length, 2)
    // Second request: assistant tool_calls, then a `tool` message with the result.
    const messages = calls[1].body.messages
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
          sseFrame({ tool_calls: [callStart(0, 'call_a', 'searchMedia', '{"que'), callStart(1, 'call_b', 'findBlocks')] }),
          sseFrame({ tool_calls: [callPart(1, '{"type":"head')] }),
          sseFrame({ tool_calls: [callPart(0, 'ry":"team"}')] }),
          sseFrame({ tool_calls: [callPart(1, 'ing"}')] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
      reply('Done.'),
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
    const messages = calls[1].body.messages
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

  it('answers invalid JSON arguments with an error chip and an error tool result, and does not run the tool', async () => {
    const { events, calls, workspace } = await run([
      {
        sse: [sseFrame({ tool_calls: [callStart(0, 'call_x', 'applyOperations', '{"operations":[{"type":"remove",')] }), sseFrame({}, 'tool_calls'), DONE_FRAME],
      },
      reply('Sorry.'),
    ])
    assert.ok(shape(events).includes('tool:applyOperations:error'))
    const chip = events.find((e) => e.type === 'tool' && e.status === 'error')
    assert.ok(chip?.type === 'tool')
    assert.match(chip.summary, /could not be read/)
    assert.equal(events.some((e) => e.type === 'operations'), false)
    assert.equal(workspace.layout.blocks.length, 1)
    const messages = calls[1].body.messages
    assert.equal(messages[4].role, 'tool')
    assert.match(String(messages[4].content), /not valid JSON/)
    // The stored call has an object input, so the history replays cleanly.
    assert.deepEqual(messages[3].tool_calls, [{ id: 'call_x', type: 'function', function: { name: 'applyOperations', arguments: '{}' } }])
  })

  it('stops on abort mid-stream without storing a partial message', async () => {
    const controller = new AbortController()
    const { events, calls } = await run(
      [{ sse: [sseFrame({ content: 'A long' }), sseFrame({ content: ' answer' }), sseFrame({ content: ' cut off.' }), sseFrame({}, 'stop'), DONE_FRAME] }],
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
      reply('Hi.'),
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
      reply('Hi.'),
    ])
    assert.equal(calls.length, 2)
    assert.equal('stream_options' in calls[1].body, false)
    assert.equal(shape(events).at(-1), 'done:end_turn')
  })

  it('reports a mid-stream error', async () => {
    const { events } = await run([
      {
        sse: [
          sseFrame({ content: 'Partial' }),
          `data: ${JSON.stringify({ error: { code: 502, message: 'Provider disconnected' }, choices: [{ index: 0, delta: {}, finish_reason: 'error' }] })}\n\n`,
        ],
      },
    ])
    assert.deepEqual(events.at(-1), { type: 'error', code: 'api_error', message: 'Example returned an error (502): Provider disconnected' })
  })

  it('keeps reasoning fields in the stored message and sends them back, without rendering them', async () => {
    const details = [{ type: 'reasoning.encrypted', data: 'abc', index: 0 }]
    const { events, calls } = await run([
      {
        sse: [
          sseFrame({ reasoning: 'Let me ', reasoning_details: [{ type: 'reasoning.text', text: 'Let me ', index: 0 }] }),
          sseFrame({ reasoning: 'think.', reasoning_details: [{ type: 'reasoning.text', text: 'think.', index: 0 }] }),
          sseFrame({ reasoning_details: details }),
          sseFrame({ tool_calls: [callStart(0, 'call_r', 'getLayout', '{}')] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
      reply('Done.'),
    ])
    assert.equal(streamText(events), 'Done.')
    const stored = messagesOf(events)[1].content as Array<Record<string, unknown>>
    assert.equal(stored[0].type, 'reasoning')
    assert.equal(stored[0].reasoning, 'Let me think.')
    assert.deepEqual(stored[0].reasoning_details, [{ type: 'reasoning.text', text: 'Let me think.', index: 0 }, { type: 'reasoning.encrypted', data: 'abc', index: 0 }])
    const assistant = calls[1].body.messages[3]
    assert.equal(assistant.reasoning, 'Let me think.')
    assert.deepEqual(assistant.reasoning_details, stored[0].reasoning_details)
  })

  it('maps a network failure after the retries to api_error', async () => {
    const { events, calls } = await run([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')])
    assert.equal(calls.length, 3)
    assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: 'Could not reach Example: fetch failed.' }])
  })

  it('shows a refusal (content_filter) as text and keeps no assistant message', async () => {
    const { events } = await run([{ sse: [sseFrame({ content: 'I cannot' }), sseFrame({}, 'content_filter'), DONE_FRAME] }])
    assert.equal(shape(events).at(-1), 'done:refusal')
    assert.equal(messagesOf(events).some((m) => m.role === 'assistant'), false)
    assert.match(streamText(events), /can’t help with that request/)
  })

  // BUG (openai-format.ts, stopReasonOf): with tool calls, content_filter becomes tool_use, so the
  // loop runs a tool call the filter cut off. `length` already wins over tool calls; content_filter should too.
  it(
    'does not run a tool call when the reply ended with content_filter',
    async () => {
      const { events } = await run([
        { sse: [sseFrame({ content: 'I cannot' }), sseFrame({ tool_calls: [callStart(0, 'call_z', 'insertSection', '{"sectionId":"hero"}')] }), sseFrame({}, 'content_filter'), DONE_FRAME] },
      ])
      assert.equal(events.some((e) => e.type === 'operations'), false)
      assert.equal(shape(events).at(-1), 'done:refusal')
    },
  )

  it('finish_reason length: tells the user, and does not run a tool call that was cut off', async () => {
    const text = await run([{ sse: [sseFrame({ content: 'A very long' }), sseFrame({}, 'length'), DONE_FRAME] }])
    assert.equal(shape(text.events).at(-1), 'done:max_tokens')
    assert.match(streamText(text.events), /hit the length limit/)

    const cut = await run([{ sse: [sseFrame({ tool_calls: [callStart(0, 'call_c', 'insertSection', '{"sectionId":"hero","index":0}')] }), sseFrame({}, 'length'), DONE_FRAME] }])
    assert.equal(cut.events.some((e) => e.type === 'operations'), false)
    assert.equal(cut.workspace.layout.blocks.length, 1)
    assert.equal(shape(cut.events).at(-1), 'done:max_tokens')
    assert.ok(shape(cut.events).includes('tool:insertSection:error'))
  })
})

// ---------------------------------------------------------------------------
// adapter.stream() directly
// ---------------------------------------------------------------------------

describe('createOpenAIFormatAdapter: request', () => {
  it('sends a POST with merged headers, stream options and no max_tokens by default', async () => {
    const { calls } = await stream([reply('Hi')], { authHeaders: { Authorization: 'Bearer a', 'X-A': '1' }, headers: { 'X-A': '2', 'X-B': '3' } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, URL)
    // `headers` come after `authHeaders` and win; the defaults stay.
    assert.deepEqual(calls[0].headers, { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: 'Bearer a', 'X-A': '2', 'X-B': '3' })
    assert.deepEqual(calls[0].body, {
      model: 'example/model',
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'Hi' },
      ],
      stream: true,
      stream_options: { include_usage: true },
    })
  })

  it('sends tools with tool_choice auto only when there are tools', async () => {
    const tool: AiToolDefinition = { name: 'ping', description: 'Ping.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
    const { calls } = await stream([reply('Hi')], {}, { tools: [tool] })
    assert.deepEqual(calls[0].body.tools, [{ type: 'function', function: { name: 'ping', description: 'Ping.', parameters: { type: 'object', properties: {} } } }])
    assert.equal(calls[0].body.tool_choice, 'auto')
  })

  it('sends max_tokens when set, omits stream_options with includeUsage false, and merges extraBody', async () => {
    const { calls } = await stream([reply('Hi')], {
      maxTokens: 777,
      includeUsage: false,
      extraBody: ({ effort }) => ({ custom: effort ?? 'none' }),
    }, { effort: 'high' })
    assert.equal(calls[0].body.max_tokens, 777)
    assert.equal('stream_options' in calls[0].body, false)
    assert.equal(calls[0].body.custom, 'high')
  })

  it('sends cache_control content parts only with cacheControl on', async () => {
    const system = [{ text: 'STABLE', cache: true }, { text: 'VARIABLE' }]
    const on = await stream([reply('Hi')], { cacheControl: true }, { system })
    assert.deepEqual(on.calls[0].body.messages[0], {
      role: 'system',
      content: [
        { type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'VARIABLE' },
      ],
    })
    const off = await stream([reply('Hi')], {}, { system })
    assert.deepEqual(off.calls[0].body.messages[0], { role: 'system', content: 'STABLE\n\nVARIABLE' })
  })

  it('has the adapter fields from its options, with defaults', () => {
    const { adapter } = makeAdapter([])
    assert.deepEqual(
      { name: adapter.name, label: adapter.label, model: adapter.model, ready: adapter.ready, setupProblem: adapter.setupProblem, keyEnv: adapter.keyEnv, keyUrl: adapter.keyUrl },
      { name: 'example', label: 'Example', model: 'example/model', ready: true, setupProblem: null, keyEnv: null, keyUrl: null },
    )
  })
})

describe('createOpenAIFormatAdapter: not ready', () => {
  it('yields one auth error with the setup problem and makes no fetch call', async () => {
    const { events, calls, adapter } = await stream([reply('Hi')], { ready: false, setupProblem: 'No key. Set EXAMPLE_KEY.', keyEnv: 'EXAMPLE_KEY', keyUrl: 'https://example.test/keys' })
    assert.deepEqual(events, [{ type: 'error', code: 'auth', message: 'No key. Set EXAMPLE_KEY.' }])
    assert.equal(calls.length, 0)
    assert.equal(adapter.ready, false)
    assert.equal(adapter.setupProblem, 'No key. Set EXAMPLE_KEY.')
    assert.equal(adapter.keyEnv, 'EXAMPLE_KEY')
    assert.equal(adapter.keyUrl, 'https://example.test/keys')
  })

  it('falls back to "<label> is not set up." without a setup problem', async () => {
    const { events, calls } = await stream([], { ready: false })
    assert.deepEqual(events, [{ type: 'error', code: 'auth', message: 'Example is not set up.' }])
    assert.equal(calls.length, 0)
  })
})

describe('createOpenAIFormatAdapter: streaming', () => {
  it('yields text, usage and done in order', async () => {
    const { events } = await stream([{ text: 'Hello there.', usage: { prompt_tokens: 10, completion_tokens: 3 } }])
    assert.deepEqual(types(events).filter((t, i, all) => t !== all[i - 1]), ['text', 'usage', 'done'])
    assert.equal(textOf(events), 'Hello there.')
    assert.deepEqual(events.find((e) => e.type === 'usage'), { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } })
    assert.deepEqual(doneOf(events), { type: 'done', stopReason: 'end_turn', content: [{ type: 'text', text: 'Hello there.' }] })
  })

  it('reads the recorded OpenRouter stream: reasoning details, text, a fragmented tool call, cost and cached tokens', async () => {
    const { events } = await stream([{ sse: OPENROUTER_STREAM }])
    assert.deepEqual(types(events).filter((t, i, all) => t !== all[i - 1]), ['text', 'toolStart', 'toolCall', 'usage', 'done'])
    assert.equal(textOf(events), OPENROUTER_EXPECTED.text)
    assert.deepEqual(events.filter((e) => e.type === 'toolStart'), [{ type: 'toolStart', id: OPENROUTER_EXPECTED.call.id, name: 'insertSection' }])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall'), [{ type: 'toolCall', ...OPENROUTER_EXPECTED.call }])
    assert.deepEqual(events.find((e) => e.type === 'usage'), { type: 'usage', usage: OPENROUTER_EXPECTED.usage })
    assert.deepEqual(doneOf(events), {
      type: 'done',
      stopReason: 'tool_use',
      content: [
        { type: 'reasoning', reasoning: OPENROUTER_EXPECTED.reasoning, reasoning_details: OPENROUTER_EXPECTED.details },
        { type: 'text', text: OPENROUTER_EXPECTED.text },
        { type: 'tool_use', ...OPENROUTER_EXPECTED.call },
      ],
    })
    // toolStart comes before the closing events, and `done` is last.
    assert.ok(types(events).indexOf('toolStart') < types(events).indexOf('toolCall'))
    assert.equal(types(events).at(-1), 'done')
  })

  it('reads the recorded Workers AI stream: a tool call with whole arguments in one chunk', async () => {
    const { events } = await stream([{ sse: WORKERS_AI_STREAM }])
    assert.equal(textOf(events), WORKERS_AI_EXPECTED.text)
    assert.deepEqual(events.filter((e) => e.type === 'toolStart'), [{ type: 'toolStart', id: WORKERS_AI_EXPECTED.call.id, name: 'findBlocks' }])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall'), [{ type: 'toolCall', ...WORKERS_AI_EXPECTED.call }])
    assert.deepEqual(events.find((e) => e.type === 'usage'), { type: 'usage', usage: WORKERS_AI_EXPECTED.usage })
    const done = doneOf(events)
    assert.equal(done.stopReason, 'tool_use')
    assert.deepEqual(done.content, [
      { type: 'text', text: WORKERS_AI_EXPECTED.text },
      { type: 'tool_use', ...WORKERS_AI_EXPECTED.call },
    ])
  })

  it('gives the same events when the stream is cut into 9-character pieces', async () => {
    const whole = await stream([{ sse: OPENROUTER_STREAM }])
    const body = OPENROUTER_STREAM.join('')
    const cut: string[] = []
    for (let i = 0; i < body.length; i += 9) cut.push(body.slice(i, i + 9))
    const split = await stream([{ sse: cut }])
    assert.deepEqual(split.events.filter((e) => e.type !== 'text'), whole.events.filter((e) => e.type !== 'text'))
    assert.equal(textOf(split.events), textOf(whole.events))
  })

  it('decodes multi-byte characters that are split between chunks', async () => {
    const bytes = new TextEncoder().encode(sseFrame({ content: 'Grüße 日本' }) + sseFrame({}, 'stop') + DONE_FRAME)
    const fakeFetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
            controller.close()
          },
        }),
        { status: 200 },
      )) as typeof fetch
    const adapter = createOpenAIFormatAdapter({ name: 'x', label: 'X', model: 'm', url: URL, keyHint: '', fetch: fakeFetch })
    const events = await collect(adapter.stream(request()))
    assert.equal(textOf(events), 'Grüße 日本')
  })

  it('stops reading at [DONE], even if the body goes on', async () => {
    const { events } = await stream([{ sse: [sseFrame({ content: 'One' }), sseFrame({}, 'stop'), DONE_FRAME, sseFrame({ content: 'ignored' })], stall: true }])
    assert.equal(textOf(events), 'One')
    assert.equal(doneOf(events).stopReason, 'end_turn')
  })

  it('ends without [DONE] when the body closes', async () => {
    const { events } = await stream([{ sse: [sseFrame({ content: 'One' }), sseFrame({}, 'stop')] }])
    assert.equal(doneOf(events).stopReason, 'end_turn')
  })

  it('ignores lines that are not JSON, and comment lines', async () => {
    const { events } = await stream([{ sse: [': ping\n\n', 'data: not json\n\n', sseFrame({ content: 'ok' }), sseFrame({}, 'stop'), DONE_FRAME] }])
    assert.equal(textOf(events), 'ok')
    assert.equal(doneOf(events).stopReason, 'end_turn')
  })

  it('reads `reasoning_content` (DeepSeek style) as reasoning', async () => {
    const { events } = await stream([{ sse: [sseFrame({ reasoning_content: 'hm' }), sseFrame({ content: 'ok' }), sseFrame({}, 'stop'), DONE_FRAME] }])
    assert.deepEqual(doneOf(events).content, [{ type: 'reasoning', reasoning: 'hm' }, { type: 'text', text: 'ok' }])
  })

  it('reads a chunk that has `message` instead of `delta`', async () => {
    const chunk = `data: ${JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'Whole answer' }, finish_reason: 'stop' }] })}\n\n`
    const { events } = await stream([{ sse: [chunk, DONE_FRAME] }])
    assert.equal(textOf(events), 'Whole answer')
  })

  it('maps finish_reason length to max_tokens and content_filter to a refusal', async () => {
    const length = await stream([{ sse: [sseFrame({ content: 'cut' }), sseFrame({}, 'length'), DONE_FRAME] }])
    assert.deepEqual(doneOf(length.events), { type: 'done', stopReason: 'max_tokens', content: [{ type: 'text', text: 'cut' }] })

    const filtered = await stream([{ sse: [sseFrame({ content: 'no' }), sseFrame({}, 'content_filter'), usageFrame({ prompt_tokens: 5, completion_tokens: 1 }), DONE_FRAME] }])
    assert.deepEqual(doneOf(filtered.events), { type: 'done', stopReason: 'refusal', content: [], refusal: { explanation: null } })
    // The usage still counts.
    assert.ok(filtered.events.some((e) => e.type === 'usage'))
  })

  it('treats finish_reason "error" as an error', async () => {
    const { events } = await stream([{ sse: [sseFrame({ content: 'x' }), sseFrame({}, 'error'), DONE_FRAME] }])
    assert.deepEqual(errorOf(events), { type: 'error', code: 'api_error', message: 'Example returned an error: The model stopped with an error' })
  })

  it('reports an in-stream error chunk after the text that came before it', async () => {
    const { events } = await stream([{ sse: IN_STREAM_ERROR_STREAM }])
    assert.equal(textOf(events), 'Let me ')
    assert.deepEqual(events.at(-1), { type: 'error', code: 'api_error', message: 'Example returned an error (502): Network connection lost' })
    assert.equal(events.some((e) => e.type === 'done'), false)
  })

  it('reports an empty response', async () => {
    for (const sse of [[], [DONE_FRAME], [': OPENROUTER PROCESSING\n\n', DONE_FRAME]]) {
      const { events } = await stream([{ sse }])
      assert.equal(events.length, 1)
      assert.equal(errorOf(events).code, 'api_error')
      assert.match(errorOf(events).message, /empty response/)
    }
  })

  it('reports a 200 response without a body', async () => {
    const { events } = await stream([{ noBody: true }], { maxRetries: 0 })
    assert.match(errorOf(events).message, /no response body/)
  })
})

describe('createOpenAIFormatAdapter: tool calls', () => {
  it('joins fragments without an index to the last call', async () => {
    const { events } = await stream([
      {
        sse: [
          sseFrame({ tool_calls: [{ id: 'c1', type: 'function', function: { name: 'findBlocks', arguments: '' } }] }),
          sseFrame({ tool_calls: [{ function: { arguments: '{"type":' } }] }),
          sseFrame({ tool_calls: [{ function: { arguments: '"heading"}' } }] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
    ])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall'), [{ type: 'toolCall', id: 'c1', name: 'findBlocks', input: { type: 'heading' } }])
    assert.equal(events.filter((e) => e.type === 'toolStart').length, 1)
  })

  it('starts a new call for a new id without an index, and joins a repeated id', async () => {
    const { events } = await stream([
      {
        sse: [
          sseFrame({ tool_calls: [{ id: 'c1', function: { name: 'getLayout', arguments: '{' } }] }),
          sseFrame({ tool_calls: [{ id: 'c1', function: { name: 'getLayout', arguments: '}' } }] }),
          sseFrame({ tool_calls: [{ id: 'c2', function: { name: 'findBlocks', arguments: '{"type":"heading"}' } }] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
    ])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall'), [
      { type: 'toolCall', id: 'c1', name: 'getLayout', input: {} },
      { type: 'toolCall', id: 'c2', name: 'findBlocks', input: { type: 'heading' } },
    ])
  })

  it('gives a call without an id a generated id, and keeps it the same in all events', async () => {
    const { events } = await stream([{ sse: [sseFrame({ tool_calls: [{ index: 0, function: { name: 'getLayout', arguments: '{}' } }] }), sseFrame({}, 'tool_calls'), DONE_FRAME] }])
    const start = events.find((e) => e.type === 'toolStart')
    const call = events.find((e) => e.type === 'toolCall')
    assert.ok(start?.type === 'toolStart' && call?.type === 'toolCall')
    assert.match(call.id, /^call_.+/)
    assert.equal(start.id, call.id)
    const content = doneOf(events).content
    assert.deepEqual(content, [{ type: 'tool_use', id: call.id, name: 'getLayout', input: {} }])
  })

  it('accepts arguments sent as an object, and an empty argument string', async () => {
    const { events } = await stream([
      {
        sse: [
          sseFrame({ tool_calls: [{ index: 0, id: 'a', function: { name: 'findBlocks', arguments: { type: 'heading' } } }] }),
          sseFrame({ tool_calls: [{ index: 1, id: 'b', function: { name: 'getLayout', arguments: '' } }] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
    ])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall'), [
      { type: 'toolCall', id: 'a', name: 'findBlocks', input: { type: 'heading' } },
      { type: 'toolCall', id: 'b', name: 'getLayout', input: {} },
    ])
  })

  it('reads double-encoded and fenced arguments', async () => {
    const { events } = await stream([
      {
        sse: [
          sseFrame({ tool_calls: [callStart(0, 'a', 'findBlocks', JSON.stringify('{"type":"heading"}'))] }),
          sseFrame({ tool_calls: [callStart(1, 'b', 'findBlocks', '```json\n{"type":"stack"}\n```')] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
    ])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall').map((e) => e.type === 'toolCall' && e.input), [{ type: 'heading' }, { type: 'stack' }])
  })

  it('sends invalid arguments as a toolCall with `error` and an empty input, and keeps the call in the content', async () => {
    const { events } = await stream([{ sse: [sseFrame({ tool_calls: [callStart(0, 'bad', 'applyOperations', '{"operations":[')] }), sseFrame({}, 'tool_calls'), DONE_FRAME] }])
    const call = events.find((e) => e.type === 'toolCall')
    assert.ok(call?.type === 'toolCall')
    assert.deepEqual({ id: call.id, name: call.name, input: call.input }, { id: 'bad', name: 'applyOperations', input: {} })
    assert.match(String(call.error), /not valid JSON/)
    assert.deepEqual(doneOf(events).content, [{ type: 'tool_use', id: 'bad', name: 'applyOperations', input: {} }])
  })

  it('orders calls by index and skips a call without a name', async () => {
    const { events } = await stream([
      {
        sse: [
          sseFrame({ tool_calls: [callStart(2, 'c', 'getLayout', '{}')] }),
          sseFrame({ tool_calls: [{ index: 1, id: 'nameless', function: { arguments: '{}' } }] }),
          sseFrame({ tool_calls: [callStart(0, 'a', 'getLayout', '{}')] }),
          sseFrame({}, 'tool_calls'),
          DONE_FRAME,
        ],
      },
    ])
    assert.deepEqual(events.filter((e) => e.type === 'toolCall').map((e) => e.type === 'toolCall' && e.id), ['a', 'c'])
  })

  it('stops with tool_use when there are calls, but with max_tokens when the length limit hit', async () => {
    const calls = await stream([{ toolCalls: [{ id: 't', name: 'getLayout', input: {} }] }])
    assert.equal(doneOf(calls.events).stopReason, 'tool_use')
    const cut = await stream([{ toolCalls: [{ id: 't', name: 'getLayout', input: {} }], finish: 'length' }])
    assert.equal(doneOf(cut.events).stopReason, 'max_tokens')
  })
})

describe('createOpenAIFormatAdapter: errors and retries', () => {
  it('401: auth error with the provider message and the key hint, not retried', async () => {
    const { events, calls } = await stream([{ status: 401, body: { error: { message: 'No auth credentials found', code: 401 } } }])
    assert.equal(calls.length, 1)
    assert.deepEqual(events, [{ type: 'error', code: 'auth', message: 'Example rejected the API key (401): No auth credentials found. Set EXAMPLE_KEY.' }])
  })

  it('402, 404 and 429 have their own messages', async () => {
    const credits = await stream([{ status: 402, body: { error: { message: 'Insufficient credits' } } }])
    assert.deepEqual(credits.events, [{ type: 'error', code: 'api_error', message: 'Example says the account has no credits left (402): Insufficient credits.' }])
    assert.equal(credits.calls.length, 1, '402 is not retried')

    const missing = await stream([{ status: 404, body: { error: { message: 'No endpoints found that support tool use' } } }])
    assert.deepEqual(missing.events, [
      {
        type: 'error',
        code: 'api_error',
        message: 'Example returned 404: No endpoints found that support tool use. Check the model id "example/model" and that the model supports tool calling.',
      },
    ])
    assert.equal(missing.calls.length, 1, '404 is not retried')

    const busy = { status: 429, body: { error: { message: 'Slow down.' } } }
    const limited = await stream([busy, busy, busy])
    assert.deepEqual(limited.events, [{ type: 'error', code: 'api_error', message: 'Example rate limit reached (429): Slow down. Wait a moment and try again.' }])
  })

  it('does not retry other 4xx errors', async () => {
    for (const status of [400, 403, 422]) {
      const { events, calls } = await stream([{ status, body: { error: { message: 'Nope' } } }])
      assert.equal(calls.length, 1, `status ${status}`)
      assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: `Example returned an error (${status}): Nope` }])
    }
  })

  it('retries 408, 429, 500 and 503, then succeeds', async () => {
    for (const status of [408, 429, 500, 503]) {
      const { events, calls, sleeps } = await stream([{ status, body: { error: { message: 'Try later' } } }, reply('Hi')])
      assert.equal(calls.length, 2, `status ${status}`)
      assert.deepEqual(sleeps, [1000])
      assert.equal(doneOf(events).stopReason, 'end_turn')
    }
  })

  it('doubles the delay with each retry, and gives up after maxRetries', async () => {
    const fail = { status: 500, body: { error: { message: 'Boom' } } }
    const { events, calls, sleeps } = await stream([fail, fail, fail, fail, fail], { maxRetries: 3, retryDelayMs: 100 })
    assert.equal(calls.length, 4)
    assert.deepEqual(sleeps, [100, 200, 400])
    assert.deepEqual(events, [{ type: 'error', code: 'api_error', message: 'Example returned an error (500): Boom' }])
  })

  it('does not retry with maxRetries 0', async () => {
    const { calls, sleeps } = await stream([{ status: 503, body: {} }, reply('Hi')], { maxRetries: 0 })
    assert.equal(calls.length, 1)
    assert.deepEqual(sleeps, [])
  })

  it('honors Retry-After in seconds, caps it at 20 seconds, and ignores a value it cannot read', async () => {
    assert.equal(await retryDelay({ 'retry-after': '3' }), 3000)
    assert.equal(await retryDelay({ 'retry-after': '0' }), 0)
    assert.equal(await retryDelay({ 'retry-after': '60' }), 20_000)
    assert.equal(await retryDelay({ 'retry-after': 'soon' }), 1000)
  })

  it('reads a Retry-After date', async () => {
    const date = new Date(Date.now() + 5000).toUTCString()
    const { sleeps } = await stream([{ status: 429, body: {}, headers: { 'retry-after': date } }, reply('Hi')])
    assert.ok(sleeps[0] > 2000 && sleeps[0] <= 5000, `delay ${sleeps[0]}`)
  })

  it('retries a network error, then reports it', async () => {
    const { events, calls, sleeps } = await stream([new TypeError('fetch failed'), reply('Hi')])
    assert.equal(calls.length, 2)
    assert.deepEqual(sleeps, [1000])
    assert.equal(doneOf(events).stopReason, 'end_turn')

    const down = await stream([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')])
    assert.equal(down.calls.length, 3)
    assert.deepEqual(down.events, [{ type: 'error', code: 'api_error', message: 'Could not reach Example: fetch failed.' }])
  })

  it('does not retry an error in the stream, after the stream started', async () => {
    const { calls } = await stream([{ sse: IN_STREAM_ERROR_STREAM }, reply('Hi')])
    assert.equal(calls.length, 1)
  })

  it('drops stream_options once when the server rejects it, without using up a retry, and keeps it off', async () => {
    const reject = { status: 400, body: { error: { message: 'Unknown parameter: stream_options.include_usage' } } }
    const { adapter, calls, sleeps } = makeAdapter([reject, reply('Hi'), reply('Again')], { maxRetries: 0 })
    const first = await collect(adapter.stream(request()))
    assert.equal(calls.length, 2)
    assert.equal('stream_options' in calls[0].body, true)
    assert.equal('stream_options' in calls[1].body, false)
    assert.deepEqual(sleeps, [], 'no waiting for this retry')
    assert.equal(doneOf(first).stopReason, 'end_turn')
    // The next request does not send it either.
    await collect(adapter.stream(request()))
    assert.equal('stream_options' in calls[2].body, false)
  })

  it('does not drop stream_options for a 400 about something else, or when it was not sent', async () => {
    const other = await stream([{ status: 400, body: { error: { message: 'max_tokens is too large' } } }, reply('Hi')])
    assert.equal(other.calls.length, 1)
    assert.equal(errorOf(other.events).code, 'api_error')

    const off = await stream([{ status: 400, body: { error: { message: 'bad stream_options' } } }, reply('Hi')], { includeUsage: false })
    assert.equal(off.calls.length, 1)
  })

  it('reads the provider message from different error bodies', async () => {
    assert.equal(await errorMessage({ status: 400, body: { error: { message: 'Plain' } } }), 'Example returned an error (400): Plain')
    assert.equal(await errorMessage({ status: 400, body: { error: 'As a string.' } }), 'Example returned an error (400): As a string')
    assert.equal(await errorMessage({ status: 400, body: { message: 'Top-level message' } }), 'Example returned an error (400): Top-level message')
    // Cloudflare's own API.
    assert.equal(await errorMessage({ status: 400, body: { success: false, errors: [{ code: 7003, message: 'No route for that URI' }] } }), 'Example returned an error (400): No route for that URI')
    // OpenRouter puts the upstream message in metadata.raw.
    assert.equal(
      await errorMessage({ status: 400, body: { error: { message: 'Provider returned error', code: 400, metadata: { raw: 'upstream says no', provider_name: 'Anthropic' } } } }),
      'Example returned an error (400): Provider returned error (upstream says no)',
    )
    // Not JSON: the text, cut at 300 characters.
    assert.equal(await errorMessage({ status: 400, rawBody: 'Bad gateway text' }), 'Example returned an error (400): Bad gateway text')
    assert.equal((await errorMessage({ status: 400, rawBody: 'x'.repeat(500) })).length, 'Example returned an error (400): '.length + 300)
    // No body: the status text.
    assert.match(await errorMessage({ status: 400 }), /^Example returned an error \(400\)/)
  })

  it('times out when the response headers do not come', async () => {
    const { events, calls, sleeps } = await stream([{ hang: true }], { timeoutMs: 30, maxRetries: 0 })
    assert.equal(calls.length, 1)
    assert.equal(sleeps.length, 0)
    assert.equal(events.length, 1)
    assert.equal(errorOf(events).code, 'api_error')
    assert.match(errorOf(events).message, /^Example did not answer in time: no response within \d+ seconds\. Try again\.$/)
  })

  it('retries a header timeout', async () => {
    const { events, calls } = await stream([{ hang: true }, reply('Hi')], { timeoutMs: 30 })
    assert.equal(calls.length, 2)
    assert.equal(doneOf(events).stopReason, 'end_turn')
  })

  it('times out when the stream goes quiet, after the text that came before', async () => {
    const { events, calls } = await stream([{ sse: [sseFrame({ content: 'Start' })], stall: true }], { idleTimeoutMs: 30 })
    assert.equal(calls.length, 1, 'no retry after the stream started')
    assert.equal(textOf(events), 'Start')
    const error = errorOf(events)
    assert.equal(events.at(-1), error)
    assert.equal(error.code, 'api_error')
    assert.match(error.message, /did not answer in time: the stream stalled for \d+ seconds/)
  })

  it('stops with an aborted error when the signal aborts mid-stream', async () => {
    const controller = new AbortController()
    const { adapter, calls } = makeAdapter([{ sse: [sseFrame({ content: 'A' }), sseFrame({ content: 'B' }), sseFrame({ content: 'C' }), sseFrame({}, 'stop'), DONE_FRAME] }])
    const events: AiModelEvent[] = []
    for await (const event of adapter.stream(request({ signal: controller.signal }))) {
      events.push(event)
      if (event.type === 'text') controller.abort()
    }
    assert.equal(calls.length, 1)
    assert.deepEqual(events.at(-1), { type: 'error', code: 'aborted', message: 'The request was cancelled.' })
    assert.equal(events.some((e) => e.type === 'done'), false)
  })

  it('stops with an aborted error when the signal aborts while the request waits', async () => {
    const controller = new AbortController()
    const { adapter, calls } = makeAdapter([{ hang: true }])
    const pending = collect(adapter.stream(request({ signal: controller.signal })))
    setTimeout(() => controller.abort(), 10)
    const events = await pending
    assert.equal(calls.length, 1)
    assert.deepEqual(events, [{ type: 'error', code: 'aborted', message: 'The request was cancelled.' }])
  })

  it('stops with an aborted error when the signal aborts during the retry delay', async () => {
    const { events, calls } = await stream([{ status: 503, body: {} }, reply('Hi')], {
      sleep: async () => {
        throw Object.assign(new Error('x'), { name: 'AbortError' })
      },
    })
    assert.equal(calls.length, 1)
    assert.deepEqual(events, [{ type: 'error', code: 'aborted', message: 'The request was cancelled.' }])
  })

  // BUG (openai-format.ts, attempt/stream): an already aborted signal is not checked, so the request
  // is sent and streamed anyway. The abort listener never fires for a signal that is aborted before it is added.
  it('does not call the API when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const { events, calls } = await stream([reply('Hi')], {}, { signal: controller.signal })
    assert.equal(calls.length, 0)
    assert.equal(events.some((e) => e.type === 'text'), false)
    assert.equal(errorOf(events).code, 'aborted')
  })
})

describe('sleep', () => {
  it('resolves after the time, and rejects with an AbortError when the signal aborts', async () => {
    await sleep(5)
    const controller = new AbortController()
    const pending = sleep(60_000, controller.signal)
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    await assert.rejects(sleep(5, controller.signal), { name: 'AbortError' })
  })
})

// ---------------------------------------------------------------------------
// createAccumulator
// ---------------------------------------------------------------------------

describe('createAccumulator', () => {
  it('calls onEvent for text and toolStart as they arrive, and returns the rest from result()', () => {
    const seen: AiModelEvent[] = []
    const accumulator = createAccumulator((event) => seen.push(event))
    accumulator.push(sseFrame({ content: 'Hi' }).slice(6).trim())
    assert.deepEqual(seen, [{ type: 'text', text: 'Hi' }])
    accumulator.push(JSON.stringify({ choices: [{ delta: { tool_calls: [callStart(0, 'c', 'getLayout')] } }] }))
    assert.deepEqual(seen.at(-1), { type: 'toolStart', id: 'c', name: 'getLayout' })
    accumulator.push(JSON.stringify({ choices: [{ delta: { tool_calls: [callPart(0, '{}')] } }] }))
    assert.equal(seen.length, 2, 'toolStart once')
    assert.equal(accumulator.done, false)
    accumulator.push('[DONE]')
    assert.equal(accumulator.done, true)
    assert.deepEqual(types(accumulator.result()), ['toolCall', 'done'])
  })

  it('merges reasoning_details items with the same index and type, keeps others apart', () => {
    const accumulator = createAccumulator(() => {})
    const push = (details: unknown[]) => accumulator.push(JSON.stringify({ choices: [{ delta: { reasoning_details: details } }] }))
    push([{ type: 'reasoning.summary', summary: 'A', index: 0 }])
    push([{ type: 'reasoning.summary', summary: 'B', index: 0 }, { type: 'reasoning.encrypted', data: 'xx', index: 0 }])
    push([{ type: 'reasoning.encrypted', data: 'yy', index: 0 }, { type: 'reasoning.text', text: 'other', index: 1 }, 'junk'])
    push([{ type: 'reasoning.text', text: '' }, { type: 'reasoning.text', text: '' }])
    const done = accumulator.result().find((e) => e.type === 'done')
    assert.ok(done?.type === 'done')
    const reasoning = done.content[0] as unknown as { reasoning_details: unknown[] }
    assert.deepEqual(reasoning.reasoning_details, [
      { type: 'reasoning.summary', summary: 'AB', index: 0 },
      { type: 'reasoning.encrypted', data: 'xxyy', index: 0 },
      { type: 'reasoning.text', text: 'other', index: 1 },
      // Items without an index are not merged.
      { type: 'reasoning.text', text: '' },
      { type: 'reasoning.text', text: '' },
    ])
  })

  it('throws the stream error from result(), and an empty-response error without chunks', () => {
    const failed = createAccumulator(() => {})
    failed.push(JSON.stringify({ error: { code: 429, message: 'Limited' }, choices: [] }))
    assert.throws(() => failed.result(), (error: unknown) => error instanceof OpenAiApiError && error.status === 429 && error.kind === 'stream' && error.message === 'Limited')

    const noCode = createAccumulator(() => {})
    noCode.push(JSON.stringify({ error: { message: 'Odd' } }))
    assert.throws(() => noCode.result(), (error: unknown) => error instanceof OpenAiApiError && error.status === null)

    const empty = createAccumulator(() => {})
    empty.push('[DONE]')
    assert.throws(() => empty.result(), /empty response/)
  })

  it('reads usage without cost or cached tokens, and keeps the last usage', () => {
    const accumulator = createAccumulator(() => {})
    accumulator.push(JSON.stringify({ choices: [{ delta: { content: 'x' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
    accumulator.push(JSON.stringify({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 0 }, cost: 0 } }))
    const usage = accumulator.result().find((e) => e.type === 'usage')
    assert.deepEqual(usage, { type: 'usage', usage: { inputTokens: 7, outputTokens: 3, cachedTokens: 0, cost: 0 } })
  })
})

// ---------------------------------------------------------------------------
// toChatMessages
// ---------------------------------------------------------------------------

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

  it('joins the system parts with a blank line', () => {
    assert.deepEqual(toChatMessages([{ text: 'A', cache: true }, { text: 'B' }], []), [{ role: 'system', content: 'A\n\nB' }])
    assert.deepEqual(toChatMessages('Plain', [], { cacheControl: false }), [{ role: 'system', content: 'Plain' }])
  })

  it('with cacheControl, makes the system message content parts with cache_control on the cached parts', () => {
    assert.deepEqual(toChatMessages([{ text: 'A', cache: true }, { text: 'B' }, { text: 'C', cache: false }], [], { cacheControl: true }), [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'A', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'B' },
          { type: 'text', text: 'C' },
        ],
      },
    ])
    assert.deepEqual(toChatMessages('Plain', [], { cacheControl: true }), [{ role: 'system', content: [{ type: 'text', text: 'Plain' }] }])
  })

  it('puts tool results before the text of the same user message, as separate tool messages', () => {
    const history: AiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Next' },
          { type: 'tool_result', tool_use_id: 'a', content: 'one' },
          { type: 'tool_result', tool_use_id: 'b', content: [{ type: 'text', text: 'two' }] },
          { type: 'tool_result', tool_use_id: 'c', content: { odd: true } },
        ],
      },
    ]
    assert.deepEqual(toChatMessages('S', history).slice(1), [
      { role: 'tool', tool_call_id: 'a', content: 'one' },
      { role: 'tool', tool_call_id: 'b', content: 'two' },
      { role: 'tool', tool_call_id: 'c', content: '{"odd":true}' },
      { role: 'user', content: 'Next' },
    ])
  })

  it('sends reasoning and reasoning_details back on the assistant message', () => {
    const details = [{ type: 'reasoning.text', text: 'x', index: 0 }]
    const history: AiMessage[] = [
      { role: 'assistant', content: [{ type: 'reasoning', reasoning: 'x', reasoning_details: details }, { type: 'tool_use', id: 't', name: 'getLayout', input: undefined }] },
      { role: 'assistant', content: [{ type: 'reasoning', reasoning_details: details }, { type: 'text', text: 'Hi' }] },
    ]
    assert.deepEqual(toChatMessages('S', history).slice(1), [
      { role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'getLayout', arguments: '{}' } }], reasoning: 'x', reasoning_details: details },
      { role: 'assistant', content: 'Hi', reasoning_details: details },
    ])
  })

  it('skips assistant messages without text and calls, empty user text and unknown blocks', () => {
    const history: AiMessage[] = [
      { role: 'assistant', content: [{ type: 'thinking', thinking: 'secret', signature: 's' }] },
      { role: 'assistant', content: '' },
      { role: 'user', content: '' },
      { role: 'user', content: [{ type: 'image', source: {} }, 'junk', null] },
      { role: 'user', content: 42 },
      { role: 'assistant', content: 'Plain assistant text' },
    ]
    assert.deepEqual(toChatMessages('S', history), [
      { role: 'system', content: 'S' },
      { role: 'assistant', content: 'Plain assistant text' },
    ])
  })

  it('joins several text blocks with a blank line', () => {
    const history: AiMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }]
    assert.deepEqual(toChatMessages('S', history)[1], { role: 'user', content: 'A\n\nB' })
  })
})

// ---------------------------------------------------------------------------
// chatTools, portableSchema, parseArguments
// ---------------------------------------------------------------------------

describe('chatTools', () => {
  it('uses simpleInputSchema when there is one, and inputSchema otherwise', () => {
    const tools: AiToolDefinition[] = [
      { name: 'a', description: 'A.', inputSchema: { type: 'object', properties: { x: { type: 'string' } } }, simpleInputSchema: { type: 'object', properties: { y: { type: 'number' } } } },
      { name: 'b', description: 'B.', inputSchema: { type: 'object', properties: { z: { type: 'string' } } } },
    ]
    assert.deepEqual(chatTools(tools), [
      { type: 'function', function: { name: 'a', description: 'A.', parameters: { type: 'object', properties: { y: { type: 'number' } } } } },
      { type: 'function', function: { name: 'b', description: 'B.', parameters: { type: 'object', properties: { z: { type: 'string' } } } } },
    ])
  })

  it('makes the schemas portable and leaves out `strict`', () => {
    const [tool] = chatTools([
      { name: 'a', description: 'A.', strict: true, inputSchema: { type: 'object', additionalProperties: false, properties: { n: { type: ['string', 'null'] }, k: { const: 'x' } } } },
    ])
    assert.deepEqual(tool.function.parameters, { type: 'object', properties: { n: { type: 'string' }, k: { enum: ['x'] } } })
    assert.deepEqual(Object.keys(tool.function), ['name', 'description', 'parameters'])
    assert.deepEqual(chatTools([]), [])
  })

  it('turns the real tool definitions into schemas without unions of type, const and additionalProperties', () => {
    const real = toolDefinitions(env)
    const tools = chatTools(real)
    assert.equal(tools.length, real.length)
    assert.doesNotMatch(JSON.stringify(tools), /additionalProperties|"const"|"type":\[/)
    // applyOperations has a simpler schema: that one is sent.
    const apply = real.find((t) => t.name === 'applyOperations')
    assert.ok(apply?.simpleInputSchema)
    assert.deepEqual(tools.find((t) => t.function.name === 'applyOperations')?.function.parameters, portableSchema(apply.simpleInputSchema))
  })
})

describe('portableSchema', () => {
  it('removes type arrays, const and additionalProperties', () => {
    assert.deepEqual(
      portableSchema({ type: 'object', additionalProperties: false, properties: { a: { type: ['string', 'null'] }, b: { const: 'x' } } }),
      { type: 'object', properties: { a: { type: 'string' }, b: { enum: ['x'] } } },
    )
  })

  it('works inside arrays, items and unions, and keeps multi-type arrays without null', () => {
    assert.deepEqual(
      portableSchema({
        type: 'array',
        items: { anyOf: [{ type: 'object', additionalProperties: false, properties: { t: { const: 'a' } } }, { type: ['string', 'number', 'null'] }] },
      }),
      { type: 'array', items: { anyOf: [{ type: 'object', properties: { t: { enum: ['a'] } } }, { type: ['string', 'number'] }] } },
    )
  })

  it('keeps properties that are named like schema keywords, and other values as they are', () => {
    const schema = { type: 'object', properties: { const: { type: 'string' }, additionalProperties: { type: 'boolean' }, type: { type: 'string', enum: ['a', 'b'] } }, required: ['type'], description: 'D', minimum: 0 }
    assert.deepEqual(portableSchema(schema), schema)
    assert.equal(portableSchema('text'), 'text')
    assert.equal(portableSchema(null), null)
    assert.equal(portableSchema(3), 3)
  })

  it('does not change its input', () => {
    const schema = { type: ['string', 'null'], properties: { a: { const: 1 } }, additionalProperties: false }
    const copy = structuredClone(schema)
    portableSchema(schema)
    assert.deepEqual(schema, copy)
  })
})

describe('parseArguments', () => {
  it('reads empty, fenced and double-encoded arguments', () => {
    assert.deepEqual(parseArguments(''), { input: {} })
    assert.deepEqual(parseArguments('   \n'), { input: {} })
    assert.deepEqual(parseArguments('{"a":1}'), { input: { a: 1 } })
    assert.deepEqual(parseArguments('```json\n{"a":1}\n```'), { input: { a: 1 } })
    assert.deepEqual(parseArguments('```\n{"a":1}\n```'), { input: { a: 1 } })
    assert.deepEqual(parseArguments('"{\\"a\\":1}"'), { input: { a: 1 } })
    assert.deepEqual(parseArguments('  {"a":{"b":[1,2]}}  '), { input: { a: { b: [1, 2] } } })
  })

  it('returns an error for anything that is not one JSON object', () => {
    for (const raw of ['[1,2]', '{"a":', 'null', '3', '"text"', 'not json', '"[1]"']) {
      const result = parseArguments(raw)
      assert.ok('error' in result, raw)
    }
    assert.match((parseArguments('[1,2]') as { error: string }).error, /must be one JSON object/)
    assert.match((parseArguments('{"a":') as { error: string }).error, /not valid JSON \(.+\)\. Send the arguments as one JSON object and try again\./)
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

// ---------------------------------------------------------------------------
// Small helpers and errors
// ---------------------------------------------------------------------------

describe('chatCompletionsUrl', () => {
  it('adds /chat/completions unless the URL already ends with it', () => {
    assert.equal(chatCompletionsUrl('https://api.example.test/v1'), 'https://api.example.test/v1/chat/completions')
    assert.equal(chatCompletionsUrl('https://api.example.test/v1/'), 'https://api.example.test/v1/chat/completions')
    assert.equal(chatCompletionsUrl('  https://api.example.test/v1///  '), 'https://api.example.test/v1/chat/completions')
    assert.equal(chatCompletionsUrl('https://api.example.test/v1/chat/completions'), 'https://api.example.test/v1/chat/completions')
    assert.equal(chatCompletionsUrl('https://api.example.test/v1/chat/completions/'), 'https://api.example.test/v1/chat/completions')
  })
})

describe('clean and bearer', () => {
  it('trims, and turns empty values into undefined', () => {
    assert.equal(clean('  key  '), 'key')
    assert.equal(clean('   '), undefined)
    assert.equal(clean(''), undefined)
    assert.equal(clean(null), undefined)
    assert.equal(clean(undefined), undefined)
    assert.equal(bearer('k'), 'Bearer k')
  })
})

describe('OpenAiApiError', () => {
  it('keeps status, kind and retryAfterMs, with defaults', () => {
    const error = new OpenAiApiError('x', { status: 500, kind: 'http', retryAfterMs: 1500 })
    assert.equal(error.status, 500)
    assert.equal(error.kind, 'http')
    assert.equal(error.retryAfterMs, 1500)
    assert.equal(error.name, 'OpenAiApiError')
    assert.ok(error instanceof Error)
    const bare = new OpenAiApiError('y', { kind: 'network' })
    assert.equal(bare.status, null)
    assert.equal(bare.retryAfterMs, null)
  })
})

describe('describeOpenAiError', () => {
  const options = { label: 'Example', keyHint: 'Set EXAMPLE_KEY.', model: 'example/model' }
  const http = (status: number | null, message: string, kind: OpenAiApiError['kind'] = 'http') => describeOpenAiError(new OpenAiApiError(message, { status, kind }), options)

  it('maps the status codes', () => {
    assert.deepEqual(http(401, 'Bad key.'), { type: 'error', code: 'auth', message: 'Example rejected the API key (401): Bad key. Set EXAMPLE_KEY.' })
    assert.deepEqual(http(402, 'Pay.'), { type: 'error', code: 'api_error', message: 'Example says the account has no credits left (402): Pay.' })
    assert.match(http(404, 'Gone').message, /returned 404: Gone\. Check the model id "example\/model"/)
    assert.deepEqual(http(429, 'Slow'), { type: 'error', code: 'api_error', message: 'Example rate limit reached (429): Slow. Wait a moment and try again.' })
    assert.equal(http(500, 'Boom').message, 'Example returned an error (500): Boom')
  })

  it('drops one trailing period and leaves out an empty detail', () => {
    assert.equal(http(500, 'Boom.').message, 'Example returned an error (500): Boom')
    assert.equal(http(500, '').message, 'Example returned an error (500)')
    assert.equal(http(null, 'Odd', 'stream').message, 'Example returned an error: Odd')
    assert.equal(http(401, '').message, 'Example rejected the API key (401). Set EXAMPLE_KEY.')
  })

  it('has messages for timeouts, network errors, aborts and other errors', () => {
    assert.equal(http(null, 'no response within 60 seconds', 'timeout').message, 'Example did not answer in time: no response within 60 seconds. Try again.')
    assert.equal(http(null, 'fetch failed', 'network').message, 'Could not reach Example: fetch failed.')
    assert.deepEqual(describeOpenAiError(Object.assign(new Error('x'), { name: 'AbortError' }), options), { type: 'error', code: 'aborted', message: 'The request was cancelled.' })
    assert.deepEqual(describeOpenAiError(new Error('Plain failure'), options), { type: 'error', code: 'api_error', message: 'Plain failure' })
    assert.deepEqual(describeOpenAiError('text', options), { type: 'error', code: 'api_error', message: 'text' })
  })
})
