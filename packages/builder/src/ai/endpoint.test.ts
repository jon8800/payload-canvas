import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PayloadRequest } from 'payload'

import type { BlockDefinition, SectionDefinition } from '../core/types'
import { fakeAdapter } from './adapters/fake'
import { NO_ADAPTER_PROBLEM, PROVIDER_REMOVED_PROBLEM } from './config'
import { aiEndpoints, allowsUpdate, parseChatRequest, type AiEndpointOptions } from './endpoint'
import type { AiAdapter, AiModelRequest, AiStreamEvent } from './types'

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
    ai: { adapter: fakeAdapter({ delayMs: 0 }) },
    collections: { pages: { field: 'layout' } },
    blocks,
    sections: [hero],
    getTokens: async () => null,
    templates: null,
    canUpdate: async () => true,
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
    const messages = events.flatMap((e) => (e.type === 'message' ? [e.message] : []))
    assert.ok(messages.every((m) => m.provider === 'fake:scripted'))
  })

  it('gives the adapter the cached system prompt, all tools and the effort', async () => {
    const { req } = fakeReq()
    const requests: AiModelRequest[] = []
    const adapter = fakeAdapter({
      steps: (request) => {
        requests.push(request)
        return { content: [{ type: 'text', text: 'Hi.' }] }
      },
    })
    await readEvents(await handler({ ai: { adapter, effort: 'high', instructions: 'Use British English.' } })(req))
    assert.equal(requests.length, 1)
    assert.equal(requests[0].system.length, 1)
    assert.equal(requests[0].system[0].cache, true)
    assert.match(requests[0].system[0].text, /Use British English\./)
    assert.equal(requests[0].effort, 'high')
    const names = requests[0].tools.map((t) => t.name)
    assert.ok(names.includes('applyOperations') && names.includes('insertSection'))
    assert.ok(requests[0].tools.find((t) => t.name === 'applyOperations')?.simpleInputSchema)
    // The history ends with the editor context, after the user's message.
    assert.equal(requests[0].messages.at(-1)?.kind, 'context')
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
    const adapter = fakeAdapter({
      steps: [
        { content: [{ type: 'tool_use', id: 'toolu_1', name: 'insertSection', input: { sectionId: 'saved:12' } }] },
        { content: [{ type: 'text', text: 'Done.' }] },
      ],
    })
    const response = await handler({ savedSections: { slug: 'builder-sections' }, ai: { adapter } })(req)
    const events = await readEvents(response)
    assert.equal(finds[0].collection, 'builder-sections')
    assert.equal(finds[0].overrideAccess, false)
    const context = JSON.stringify(events[0].type === 'message' ? events[0].message.content : null)
    assert.match(context, /- saved:12: Team intro: heading \\"Our team\\"/)
    const inserted = events.flatMap((e) => (e.type === 'operations' ? e.ops : []))
    assert.equal(inserted.length, 1)
    assert.ok(inserted[0].type === 'insert' && inserted[0].block.props?.text === 'Our team')
  })

  it('reports an adapter auth error as no_api_key', async () => {
    const { req } = fakeReq()
    const adapter = fakeAdapter({ steps: [{ type: 'error', code: 'auth', message: 'No key.' }] })
    const events = await readEvents(await handler({ ai: { adapter } })(req))
    assert.deepEqual(events, [{ type: 'error', code: 'no_api_key', message: 'No key.' }])
  })

  it('rejects history written by another adapter or model', async () => {
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
    const response = await handler()(req)
    assert.equal(response.status, 409)
    const [event] = await readEvents(response)
    assert.ok(event.type === 'error' && event.code === 'invalid_request')
    assert.match(event.message, /Start a new chat/)
  })
})

describe('chat endpoint without an adapter', () => {
  it('answers no_api_key with what to set', async () => {
    const { req } = fakeReq()
    const response = await handler({ ai: {} })(req)
    assert.equal(response.status, 500)
    assert.deepEqual(await readEvents(response), [{ type: 'error', code: 'no_api_key', message: NO_ADAPTER_PROBLEM }])
  })

  it('names the replacement when the config still uses ai.provider', async () => {
    const { req } = fakeReq()
    const ai = { provider: { type: 'openrouter' } } as unknown as { adapter?: AiAdapter }
    const [event] = await readEvents(await handler({ ai })(req))
    assert.ok(event.type === 'error' && event.message === PROVIDER_REMOVED_PROBLEM)
  })

  it('still rejects anonymous requests first', async () => {
    const { req } = fakeReq({ user: null })
    assert.equal((await handler({ ai: {} })(req)).status, 401)
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
