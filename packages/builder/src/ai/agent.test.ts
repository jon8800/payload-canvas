import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import { AI_BETAS, runAssistant, sanitizeFallback, toParam, type DescribeError } from './agent'
import { createFakeClient, demoScript, type FakeBlock, type FakeStep } from './fake'
import { toolDefinitions, Workspace, type ToolEnv } from './tools'
import type { AiMessage, AiStreamEvent } from './types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} }, ai: { description: 'A container.' } },
  {
    type: 'heading',
    label: 'Heading',
    fields: [
      { name: 'text', type: 'text', required: true },
      { name: 'level', type: 'select', options: ['1', '2'] },
    ],
  },
]

const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  category: 'Heroes',
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
const thinking: FakeBlock = { type: 'thinking', thinking: '', signature: 'sig-1' }

const genericError: DescribeError = (error) => ({ type: 'error', code: 'api_error', message: String(error) })

async function run(
  steps: FakeStep[],
  options: { messages?: AiMessage[]; signal?: AbortSignal; env?: ToolEnv; abortAt?: { call: number; event: number; controller: AbortController } } = {},
) {
  let call = -1
  const { client, calls } = createFakeClient(
    (_params, index) => {
      call = index
      return steps[index]
    },
    {
      onEvent: (_event, i) => {
        const at = options.abortAt
        if (at && call === at.call && i === at.event) at.controller.abort()
      },
    },
  )
  const events: AiStreamEvent[] = []
  const workspace = new Workspace(structuredClone(startLayout), blocks)
  await runAssistant({
    client,
    model: 'claude-opus-5-5',
    effort: 'medium',
    maxSteps: 6,
    maxTokens: 32000,
    fallbacks: true,
    system: 'SYSTEM',
    tools: toolDefinitions(env),
    messages: options.messages ?? [userMessage],
    context,
    workspace,
    env: options.env ?? env,
    emit: (event) => events.push(event),
    describeError: genericError,
    signal: options.signal ?? options.abortAt?.controller.signal,
    turnId: 'turn_1',
  })
  return { events, calls, workspace }
}

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

const readLayoutStep: FakeStep = () => ({
  content: [{ type: 'tool_use', id: `toolu_${Math.random()}`, name: 'getLayout', input: {} }],
  stop_reason: 'tool_use',
})

const textOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
const messagesOf = (events: AiStreamEvent[]) => events.flatMap((e) => (e.type === 'message' ? [e.message] : []))

describe('runAssistant', () => {
  it('(a) streams a text-only reply and returns the assistant content unchanged', async () => {
    const content: FakeBlock[] = [thinking, { type: 'text', text: 'Hello! What should I build?' }]
    const { events, calls } = await run([{ content, stop_reason: 'end_turn' }])
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'message:assistant', 'done:end_turn'])
    assert.equal(textOf(events), 'Hello! What should I build?')
    assert.deepEqual(messagesOf(events)[1], { role: 'assistant', content })

    // Request shape: cached system prefix, adaptive thinking with drop_block, effort, fallbacks.
    const params = calls[0]
    assert.equal(params.model, 'claude-opus-5-5')
    assert.deepEqual(params.system, [{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }])
    assert.deepEqual(params.cache_control, { type: 'ephemeral' })
    assert.deepEqual(params.thinking, { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } })
    assert.deepEqual(params.output_config, { effort: 'medium' })
    assert.equal(params.fallbacks, 'default')
    assert.deepEqual(params.betas, [AI_BETAS.fallback, AI_BETAS.thinkingBinding])
    assert.equal(params.tool_choice, undefined)
    assert.deepEqual(params.messages, [toParam(userMessage), toParam(context)])
    // Context `kind` never reaches the API.
    assert.ok(params.messages.every((m) => !('kind' in m)))
    for (const tool of params.tools ?? []) {
      assert.equal((tool as { eager_input_streaming?: boolean }).eager_input_streaming, true)
      assert.equal((tool as { strict?: boolean }).strict, (tool as { name: string }).name === 'applyOperations' ? undefined : true)
    }
  })

  it('(b) runs insertSection, streams operations, then the final text; history round-trips', async () => {
    const step1: FakeBlock[] = [
      thinking,
      { type: 'text', text: 'Adding a hero.' },
      { type: 'tool_use', id: 'toolu_1', name: 'insertSection', input: { sectionId: 'hero', index: 0 } },
    ]
    const step2: FakeBlock[] = [{ type: 'text', text: 'Added the hero section at the top.' }]
    const { events, calls, workspace } = await run([
      { content: step1, stop_reason: 'tool_use' },
      { content: step2, stop_reason: 'end_turn' },
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
    assert.equal(textOf(events), 'Adding a hero.\n\nAdded the hero section at the top.')

    const ops = events.find((e) => e.type === 'operations')
    assert.ok(ops && ops.type === 'operations')
    assert.equal(ops.turnId, 'turn_1')
    assert.equal(ops.ops.length, 1)
    const op = ops.ops[0]
    assert.ok(op.type === 'insert')
    assert.notEqual(op.block.id, 'sec', 'section ids are regenerated')
    assert.deepEqual(op.to, { parentId: null, slot: 'children', index: 0 })
    assert.equal(workspace.layout.blocks[0].id, op.block.id)
    const done = events.find((e) => e.type === 'tool' && e.status === 'done')
    assert.ok(done && done.type === 'tool' && done.summary === 'Inserted Hero')

    // The second call carries the assistant content verbatim and the tool result.
    const second = calls[1].messages
    assert.deepEqual(second[2], { role: 'assistant', content: step1 })
    const results = second[3].content as Array<{ type: string; tool_use_id: string; content: string }>
    assert.equal(results.length, 1)
    assert.equal(results[0].tool_use_id, 'toolu_1')
    assert.equal((JSON.parse(results[0].content) as { inserted: Array<{ id: string }> }).inserted[0].id, op.block.id)

    // Next turn: client history (the emitted messages) goes back unchanged.
    const history = [userMessage, ...messagesOf(events), { role: 'user' as const, content: 'Thanks' }]
    const next = await run([{ content: [{ type: 'text', text: 'You are welcome.' }], stop_reason: 'end_turn' }], { messages: history })
    assert.deepEqual(next.calls[0].messages, [...history.map(toParam), toParam(context)])
    assert.deepEqual(next.calls[0].messages[2], { role: 'assistant', content: step1 })
  })

  it('(c) answers parallel tool calls in one user message', async () => {
    const step1: FakeBlock[] = [
      { type: 'tool_use', id: 'toolu_a', name: 'applyOperations', input: { operations: [{ type: 'insert', block: { type: 'heading', props: { text: 'Pricing' } }, to: { parentId: null, index: 1 } }] } },
      { type: 'tool_use', id: 'toolu_b', name: 'searchMedia', input: { query: 'team' } },
    ]
    const { events, calls } = await run([
      { content: step1, stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
    ])
    assert.deepEqual(shape(events), [
      'message:user:context',
      'tool:applyOperations:running',
      'tool:searchMedia:running',
      'message:assistant',
      'operations',
      'tool:applyOperations:done',
      'tool:searchMedia:done',
      'message:user:tool_results',
      'text',
      'message:assistant',
      'done:end_turn',
    ])
    const results = calls[1].messages[3].content as Array<{ tool_use_id: string; is_error?: boolean; content: string }>
    assert.deepEqual(results.map((r) => r.tool_use_id), ['toolu_a', 'toolu_b'])
    assert.ok(results.every((r) => !r.is_error))
    // The generated id of the new heading comes back to the model.
    const inserted = (JSON.parse(results[0].content) as { inserted: Array<{ id: string }> }).inserted
    assert.match(inserted[0].id, /^b_[0-9a-z]{6}$/)
    assert.match(results[1].content, /team\.jpg/)
  })

  it('(d) rolls back an invalid operation, returns the error, and the model fixes it', async () => {
    const bad: FakeBlock[] = [
      { type: 'tool_use', id: 'toolu_bad', name: 'applyOperations', input: { operations: [{ type: 'insert', block: { id: 'b_new', type: 'carousel' }, to: { parentId: null, index: 0 } }] } },
    ]
    const good: FakeBlock[] = [
      { type: 'tool_use', id: 'toolu_good', name: 'applyOperations', input: { operations: [{ type: 'insert', block: { id: 'b_new', type: 'heading', props: { text: 'Hi' } }, to: { parentId: null, index: 0 } }] } },
    ]
    const { events, calls, workspace } = await run([
      { content: bad, stop_reason: 'tool_use' },
      { content: good, stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Added a heading.' }], stop_reason: 'end_turn' },
    ])
    assert.deepEqual(shape(events), [
      'message:user:context',
      'tool:applyOperations:running',
      'message:assistant',
      'tool:applyOperations:error',
      'message:user:tool_results',
      'tool:applyOperations:running',
      'message:assistant',
      'operations',
      'tool:applyOperations:done',
      'message:user:tool_results',
      'text',
      'message:assistant',
      'done:end_turn',
    ])
    const error = (calls[1].messages[3].content as Array<{ is_error?: boolean; content: string }>)[0]
    assert.equal(error.is_error, true)
    assert.match(error.content, /Unknown block type \\"carousel\\"/)
    assert.deepEqual(workspace.layout.blocks.map((b) => b.id), ['b_new', 'b_intro'])
    assert.equal(findBlock(workspace.layout, 'b_new')?.type, 'heading')
  })

  it('(e) handles a refusal: explains, runs no tools, stores no partial message', async () => {
    const { events, calls } = await run([
      {
        content: [{ type: 'text', text: 'Sure, ' }, { type: 'tool_use', id: 'toolu_x', name: 'applyOperations', input: { operations: [] } }],
        stop_reason: 'refusal',
        stop_details: { category: 'cyber', explanation: null },
      },
    ])
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'tool:applyOperations:running', 'text', 'done:refusal'])
    assert.match(textOf(events), /can’t help with that request/)
    assert.equal(events.some((e) => e.type === 'operations'), false)
    assert.equal(calls.length, 1)
  })

  it('(f) stops on abort mid-stream without storing a partial message', async () => {
    const controller = new AbortController()
    const { events, calls } = await run(
      [
        { content: [{ type: 'text', text: 'A long answer that gets cut off part way through.' }], stop_reason: 'end_turn' },
        { content: [{ type: 'text', text: 'never' }], stop_reason: 'end_turn' },
      ],
      { abortAt: { call: 0, event: 3, controller } },
    )
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'error:aborted'])
    assert.equal(calls.length, 1)
  })

  it('aborts before the next step when the client leaves during a tool round', async () => {
    const controller = new AbortController()
    const step1: FakeBlock[] = [{ type: 'tool_use', id: 'toolu_1', name: 'searchMedia', input: { query: 'team' } }]
    const leaving: ToolEnv = {
      ...env,
      searchMedia: async () => {
        controller.abort()
        return []
      },
    }
    const { events, calls } = await run([{ content: step1, stop_reason: 'tool_use' }, { content: [], stop_reason: 'end_turn' }], {
      env: leaving,
      signal: controller.signal,
    })
    // The round is complete in the history (assistant + results), then the loop stops.
    assert.deepEqual(shape(events), [
      'message:user:context',
      'tool:searchMedia:running',
      'message:assistant',
      'tool:searchMedia:done',
      'message:user:tool_results',
      'error:aborted',
    ])
    assert.equal(calls.length, 1)
  })

  it('does not run tool calls cut off by max_tokens, but answers them', async () => {
    const step1: FakeBlock[] = [{ type: 'tool_use', id: 'toolu_1', name: 'insertSection', input: { sectionId: 'hero' } }]
    const { events, workspace } = await run([{ content: step1, stop_reason: 'max_tokens' }])
    assert.deepEqual(shape(events), ['message:user:context', 'tool:insertSection:running', 'message:assistant', 'tool:insertSection:error', 'message:user:tool_results', 'text', 'done:max_tokens'])
    assert.equal(workspace.layout.blocks.length, 1)
  })

  it('resumes pause_turn by sending the paused turn back', async () => {
    const paused: FakeBlock[] = [{ type: 'text', text: 'Working…' }]
    const { events, calls } = await run([
      { content: paused, stop_reason: 'pause_turn' },
      { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
    ])
    assert.deepEqual(shape(events), ['message:user:context', 'text', 'message:assistant', 'text', 'message:assistant', 'done:end_turn'])
    assert.deepEqual(calls[1].messages.at(-1), { role: 'assistant', content: paused })
  })

  it('reports an API error and stops', async () => {
    const { events } = await run([new Error('boom')])
    assert.deepEqual(shape(events), ['error:api_error'])
  })

  it('stops after maxSteps', async () => {
    const { events } = await run(Array.from({ length: 6 }, () => readLayoutStep))
    assert.equal(shape(events).at(-1), 'done:max_steps')
  })
})

describe('sanitizeFallback', () => {
  it('keeps only text before the last fallback block', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Part' },
      { type: 'tool_use', id: 't', name: 'getLayout', input: {} },
      { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
      { type: 'thinking', thinking: '', signature: 's2' },
      { type: 'text', text: 'Rest' },
    ] as unknown as Parameters<typeof sanitizeFallback>[0]
    assert.deepEqual(
      sanitizeFallback(content).map((b) => b.type),
      ['text', 'fallback', 'thinking', 'text'],
    )
  })
})

describe('demo script (BUILDER_AI_FAKE)', () => {
  it('inserts the hero section, then updates its heading', async () => {
    const script = demoScript([hero])
    const { events, workspace } = await run([script, script, script])
    const ops = events.flatMap((e) => (e.type === 'operations' ? e.ops : []))
    assert.deepEqual(ops.map((op) => op.type), ['insert', 'update'])
    const title = workspace.layout.blocks[0].slots?.children?.[0]
    assert.equal(title?.props?.text, 'Built with the AI assistant')
    assert.equal(shape(events).at(-1), 'done:end_turn')
  })
})
