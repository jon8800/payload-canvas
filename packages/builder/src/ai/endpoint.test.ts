import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PayloadRequest } from 'payload'

import type { BlockDefinition, SectionDefinition } from '../core/types'
import { loadClient, NO_KEY_MESSAGE } from './client'
import { aiEndpoints, allowsUpdate, parseChatRequest, type AiEndpointOptions } from './endpoint'
import { createFakeChatFetch, createFakeClient, demoScript } from './fake'
import type { AiStreamEvent } from './types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true }] },
]
const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  blocks: [{ id: 'sec', type: 'stack', slots: { children: [{ id: 'title', type: 'heading', props: { text: 'Welcome' } }] } }],
}

const body = {
  collection: 'pages',
  id: 'p1',
  messages: [{ role: 'user', content: 'Add a hero' }],
  layout: { version: 1, blocks: [{ id: 'b_intro', type: 'heading', props: { text: 'Intro' } }] },
  selectedId: 'b_intro',
  canvasWidth: 390,
}

function handler(overrides: Partial<AiEndpointOptions> = {}) {
  const [chat] = aiEndpoints({
    ai: {},
    collections: { pages: { field: 'layout' } },
    blocks,
    sections: [hero],
    getTokens: async () => null,
    templates: null,
    canUpdate: async () => true,
    env: {},
    loadClient: async () => ({ client: createFakeClient(demoScript([hero])).client, describeError: () => null }),
    ...overrides,
  })
  return chat.handler
}

function fakeReq(options: { user?: unknown; data?: unknown; docs?: Record<string, Record<string, unknown>> } = {}) {
  const docs = options.docs ?? { p1: { id: 'p1', title: 'Home', layout: body.layout } }
  const finds: Record<string, unknown>[] = []
  const req = {
    user: options.user === undefined ? { id: 1, email: 'ed@x.test' } : options.user,
    data: options.data === undefined ? structuredClone(body) : options.data,
    payload: {
      collections: {
        pages: { config: { versions: { drafts: true }, admin: { useAsTitle: 'title' }, fields: [] } },
        media: { config: { fields: [{ name: 'alt' }, { name: 'filename' }, { name: 'mimeType' }] } },
      },
      async findByID(args: Record<string, unknown>) {
        finds.push(args)
        const doc = docs[String(args.id)]
        if (!doc) throw Object.assign(new Error('Not Found'), { status: 404 })
        return structuredClone(doc)
      },
      async find() {
        return { docs: [] }
      },
      config: { serverURL: 'https://site.test' },
    },
  } as unknown as PayloadRequest
  return { req, finds }
}

/** Parses an SSE body into events (comments skipped). */
async function readEvents(response: Response): Promise<AiStreamEvent[]> {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter((frame) => frame.includes('data: '))
    .map((frame) => {
      const lines = frame.split('\n')
      const type = lines.find((l) => l.startsWith('event: '))?.slice(7)
      const event = JSON.parse(lines.find((l) => l.startsWith('data: '))?.slice(6) ?? 'null') as AiStreamEvent
      assert.equal(type, event.type, 'event: line matches data.type')
      return event
    })
}

describe('chat endpoint', () => {
  it('rejects anonymous requests', async () => {
    const { req } = fakeReq({ user: null })
    const response = await handler()(req)
    assert.equal(response.status, 401)
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/)
    assert.deepEqual((await readEvents(response)).map((e) => e.type === 'error' && e.code), ['forbidden'])
  })

  it('rejects an invalid body', async () => {
    const { req } = fakeReq({ data: { ...body, messages: [{ role: 'assistant', content: 'hi' }] } })
    const response = await handler()(req)
    assert.equal(response.status, 400)
    const [event] = await readEvents(response)
    assert.ok(event.type === 'error' && event.code === 'invalid_request')
  })

  it('rejects collections without the builder', async () => {
    const { req } = fakeReq({ data: { ...body, collection: 'users' } })
    assert.equal((await handler()(req)).status, 404)
  })

  it('returns 404 for a document the user cannot find', async () => {
    const { req, finds } = fakeReq({ data: { ...body, id: 'nope' } })
    assert.equal((await handler()(req)).status, 404)
    assert.equal(finds[0].overrideAccess, false)
    assert.deepEqual(finds[0].user, { id: 1, email: 'ed@x.test' })
  })

  it('returns 403 without update access', async () => {
    const { req } = fakeReq()
    const checked: unknown[] = []
    const response = await handler({
      canUpdate: async (_req, collection, id, field) => {
        checked.push([collection, id, field])
        return false
      },
    })(req)
    assert.equal(response.status, 403)
    assert.deepEqual(checked, [['pages', 'p1', 'layout']])
    const [event] = await readEvents(response)
    assert.ok(event.type === 'error' && event.code === 'forbidden')
  })

  it('streams the agent events with SSE headers', async () => {
    const { req } = fakeReq()
    const response = await handler()(req)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform')
    assert.equal(response.headers.get('x-accel-buffering'), 'no')
    const events = await readEvents(response)
    assert.equal(events[0].type, 'message')
    assert.ok(events[0].type === 'message' && events[0].message.kind === 'context')
    const contextText = JSON.stringify(events[0].type === 'message' ? events[0].message.content : null)
    assert.match(contextText, /Selected block: b_intro/)
    assert.match(contextText, /Canvas width: 390px/)
    assert.match(contextText, /\\"Home\\"/)
    const ops = events.flatMap((e) => (e.type === 'operations' ? e.ops.map((op) => op.type) : []))
    assert.deepEqual(ops, ['insert', 'update'])
    assert.equal(events.at(-1)?.type, 'done')
  })

  it('loads saved sections per request: in the context and insertable by id', async () => {
    const { req } = fakeReq()
    const finds: Record<string, unknown>[] = []
    ;(req.payload as unknown as { find: unknown }).find = async (args: Record<string, unknown>) => {
      finds.push(args)
      return {
        docs: [{ id: 12, name: 'Team intro', blocks: [{ id: 's1', type: 'heading', props: { text: 'Our team' } }] }],
      }
    }
    const { client } = createFakeClient([
      { content: [{ type: 'tool_use', id: 'toolu_1', name: 'insertSection', input: { sectionId: 'saved:12' } }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
    ])
    const response = await handler({
      savedSections: { slug: 'builder-sections' },
      loadClient: async () => ({ client, describeError: () => null }),
    })(req)
    const events = await readEvents(response)
    assert.equal(finds[0].collection, 'builder-sections')
    assert.equal(finds[0].overrideAccess, false)
    const context = JSON.stringify(events[0].type === 'message' ? events[0].message.content : null)
    assert.match(context, /- saved:12: Team intro: heading \\"Our team\\"/)
    const inserted = events.flatMap((e) => (e.type === 'operations' ? e.ops : []))
    assert.equal(inserted.length, 1)
    assert.ok(inserted[0].type === 'insert' && inserted[0].block.props?.text === 'Our team')
  })

  it('reports missing credentials as no_api_key', async () => {
    const { req } = fakeReq()
    const { client } = createFakeClient([new Error('Could not resolve authentication method.')])
    const response = await handler({
      loadClient: async () => ({ client, describeError: () => ({ type: 'error', code: 'no_api_key', message: NO_KEY_MESSAGE }) }),
    })(req)
    const events = await readEvents(response)
    assert.deepEqual(events, [{ type: 'error', code: 'no_api_key', message: NO_KEY_MESSAGE }])
  })
})

const openrouter = (fetch?: typeof globalThis.fetch, env: Record<string, string> = { OPENROUTER_API_KEY: 'sk-or-test' }) =>
  handler({ ai: { provider: { type: 'openrouter' }, model: 'openai/gpt-6-luna' }, env, fetch, loadClient: undefined })

describe('chat endpoint with OpenRouter', () => {
  it('streams the agent over Chat Completions, with OpenRouter URL and headers', async () => {
    const fake = createFakeChatFetch(demoScript([hero]))
    const { req } = fakeReq()
    const events = await readEvents(await openrouter(fake.fetch)(req))
    const ops = events.flatMap((e) => (e.type === 'operations' ? e.ops.map((op) => op.type) : []))
    assert.deepEqual(ops, ['insert', 'update'])
    assert.equal(events.at(-1)?.type, 'done')
    const messages = events.flatMap((e) => (e.type === 'message' ? [e.message] : []))
    assert.ok(messages.every((m) => m.provider === 'openrouter:openai/gpt-6-luna'))
    const call = fake.calls[0]
    assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(call.headers.Authorization, 'Bearer sk-or-test')
    assert.equal(call.headers['HTTP-Referer'], 'https://site.test')
    assert.equal(call.headers['X-Title'], 'Payload Website Builder')
    assert.equal(call.body.model, 'openai/gpt-6-luna')
  })

  it('reports a missing key as no_api_key before calling the API', async () => {
    const fake = createFakeChatFetch([])
    const { req } = fakeReq()
    const [event] = await readEvents(await openrouter(fake.fetch, {})(req))
    assert.ok(event.type === 'error' && event.code === 'no_api_key')
    assert.match(event.message, /OPENROUTER_API_KEY/)
    assert.equal(fake.calls.length, 0)
  })

  it('rejects history written by another provider', async () => {
    const { req } = fakeReq({
      data: {
        ...body,
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: [{ type: 'text', text: 'Hello' }], provider: 'anthropic:claude-opus-5-5' },
          { role: 'user', content: 'Add a hero' },
        ],
      },
    })
    const response = await openrouter(createFakeChatFetch([]).fetch)(req)
    assert.equal(response.status, 409)
    const [event] = await readEvents(response)
    assert.ok(event.type === 'error' && event.code === 'invalid_request')
    assert.match(event.message, /Start a new chat/)
  })

  it('BUILDER_AI_FAKE=1 bypasses the network for OpenAI-compatible providers', async () => {
    const saved = process.env.BUILDER_AI_FAKE
    process.env.BUILDER_AI_FAKE = '1'
    try {
      const { req } = fakeReq()
      const events = await readEvents(await openrouter(undefined, {})(req))
      assert.deepEqual(
        events.flatMap((e) => (e.type === 'operations' ? e.ops.map((op) => op.type) : [])),
        ['insert', 'update'],
      )
      assert.equal(events.at(-1)?.type, 'done')
    } finally {
      if (saved === undefined) delete process.env.BUILDER_AI_FAKE
      else process.env.BUILDER_AI_FAKE = saved
    }
  })
})

describe('loadClient without credentials', () => {
  it('maps the SDK failure to no_api_key', async () => {
    const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN }
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
    try {
      const loaded = await loadClient(undefined)
      assert.ok(!('error' in loaded))
      const described = loaded.describeError(new Error('Could not resolve authentication method.'), { streamStarted: false })
      assert.equal(described?.code, 'no_api_key')
    } finally {
      if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key
      if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token
    }
  })
})

describe('parseChatRequest', () => {
  it('keeps role, content, kind and provider only', () => {
    const parsed = parseChatRequest({
      ...body,
      messages: [
        { role: 'user', content: 'a', extra: 1 },
        { role: 'user', kind: 'context', content: [{ type: 'text', text: 'ctx' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'b' }], kind: 'bogus' },
        { role: 'user', content: 'c' },
      ],
    })
    assert.ok(typeof parsed !== 'string')
    assert.deepEqual(parsed.messages, [
      { role: 'user', content: 'a' },
      { role: 'user', kind: 'context', content: [{ type: 'text', text: 'ctx' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
      { role: 'user', content: 'c' },
    ])
  })

  it('rejects a conversation that does not end with a user message', () => {
    assert.equal(
      parseChatRequest({ ...body, messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }),
      'The last message must be the new user message',
    )
  })
})

describe('allowsUpdate', () => {
  it('reads sanitized Payload permissions', () => {
    assert.equal(allowsUpdate(true, 'layout'), true)
    assert.equal(allowsUpdate({ update: true }, 'layout'), true)
    assert.equal(allowsUpdate({ update: { permission: true } }, 'layout'), true)
    assert.equal(allowsUpdate({ read: true }, 'layout'), false)
    assert.equal(allowsUpdate({ update: true, fields: { layout: { read: true } } }, 'layout'), false)
    assert.equal(allowsUpdate({ update: true, fields: { layout: { update: true } } }, 'layout'), true)
    assert.equal(allowsUpdate({ update: true, fields: { title: { read: true } } }, 'layout'), true)
  })
})
