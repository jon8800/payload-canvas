import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout, SectionDefinition } from '../core/types'
import { channelKey, createMemoryBus, type BusMessage } from '../live/bus'
import { createKeyedMutex } from '../live/mutex'
import { LIVE_RUNTIME_KEY, type LiveRuntime } from '../live/runtime'
import type { LiveOperationsEvent } from '../live/types'
import { builderMcpTools, sectionInsertOps, type BuilderMcpTool } from './index'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} }, ai: { description: 'A container.' } },
  {
    type: 'heading',
    label: 'Heading',
    fields: [
      { name: 'text', type: 'text', required: true },
      { name: 'level', type: 'select', options: ['1', '2'] },
    ],
    ai: { description: 'A heading.', example: { type: 'heading', props: { text: 'Hi', level: '2' } } },
  },
]

const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  category: 'Heroes',
  blocks: [{ id: 'sec', type: 'stack', slots: { children: [{ id: 'title', type: 'heading', props: { text: 'Welcome' } }] } }],
}

const tools = builderMcpTools({
  blocks,
  sections: [hero],
  collections: { pages: { field: 'layout', url: (doc) => `/${String(doc.slug)}` } },
})
const tool = (name: string): BuilderMcpTool => {
  const found = tools.find((t) => t.name === name)
  if (!found) throw new Error(`No tool ${name}`)
  return found
}
const args = (name: string, value: unknown) => z.object(tool(name).parameters).safeParse(value)

/** A fake request: one page document, the API-key collection, and the live runtime on the config. */
function fakeRequest(layout: Layout = { version: 1, blocks: [] }) {
  const runtime: LiveRuntime = { bus: createMemoryBus(), mutex: createKeyedMutex() }
  let doc: Record<string, unknown> = { id: 'p1', title: 'Home', slug: 'home', _status: 'draft', updatedAt: 't0', layout }
  const calls: Record<string, unknown>[] = []
  const payload = {
    collections: {
      pages: {
        config: {
          versions: { drafts: true },
          admin: { useAsTitle: 'title', preview: (d: Record<string, unknown>) => `/preview/${String(d.slug)}` },
        },
      },
    },
    config: { serverURL: '', routes: { admin: '/admin' }, custom: { [LIVE_RUNTIME_KEY]: runtime } },
    async findByID(a: Record<string, unknown>) {
      calls.push({ op: 'findByID', ...a })
      if (a.collection === 'payload-mcp-api-keys') return { id: 7, name: 'Claude Desktop' }
      if (a.id !== 'p1') throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(doc)
    },
    async update(a: Record<string, unknown>) {
      calls.push({ op: 'update', ...a })
      doc = { ...doc, ...(a.data as object), updatedAt: `t${calls.length}` }
      return structuredClone(doc)
    },
  }
  const req = {
    payload,
    user: { id: 1, email: 'ed@x.test', _mcpKey: { keyId: 7 } },
    url: 'http://site.test/api/mcp',
  } as unknown as PayloadRequest
  return { req, runtime, calls, get doc() { return doc } }
}

const json = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text) as Record<string, unknown>

describe('builderMcpTools', () => {
  it('declares every tool with collection routing', () => {
    assert.deepEqual(
      tools.map((t) => `${t.name}:${t.routing.action}`),
      [
        'listBlocks:read',
        'getBlockSchema:read',
        'listSections:read',
        'insertSection:update',
        'getLayout:read',
        'applyOperations:update',
        'validateLayout:read',
        'getPreviewUrl:read',
      ],
    )
    for (const t of tools) {
      assert.equal(t.routing.kind, 'collection')
      // The toolkit reads the target collection from this argument for the scope check.
      assert.ok('collection' in t.parameters, `${t.name} needs a collection argument`)
    }
  })

  it('validates arguments', () => {
    assert.ok(args('listBlocks', { collection: 'pages' }).success)
    assert.equal(args('listBlocks', { collection: 'users' }).success, false)
    assert.equal(args('listBlocks', {}).success, false)

    const ok = args('applyOperations', {
      collection: 'pages',
      id: 'p1',
      operations: [
        { type: 'insert', block: { id: 'b_1', type: 'heading', props: { text: 'A' } }, to: { parentId: null, index: 0 } },
        { type: 'move', id: 'b_1', to: { parentId: 'x', slot: 'children', index: 2 } },
        { type: 'update', id: 'b_1', props: { text: 'B' }, className: null },
        { type: 'duplicate', id: 'b_1' },
        { type: 'remove', id: 'b_1' },
      ],
    })
    assert.ok(ok.success, ok.success ? '' : ok.error.message)
    assert.equal(args('applyOperations', { collection: 'pages', id: 'p1', operations: [] }).success, false)
    assert.equal(args('applyOperations', { collection: 'pages', id: 'p1', operations: [{ type: 'explode', id: 'x' }] }).success, false)
    assert.equal(
      args('applyOperations', { collection: 'pages', id: 'p1', operations: [{ type: 'move', id: 'x', to: { parentId: null, index: -1 } }] }).success,
      false,
    )
    assert.equal(args('insertSection', { collection: 'pages', id: 'p1' }).success, false)
  })

  it('throws without collections', () => {
    assert.throws(() => builderMcpTools({ blocks, collections: {} }), /collections/)
  })
})

describe('read tools', () => {
  it('listBlocks describes props, slots and examples', async () => {
    const { req } = fakeRequest()
    const body = json(await tool('listBlocks').handler({ collection: 'pages' }, req, {}))
    const list = body.blocks as Record<string, unknown>[]
    assert.deepEqual(list[0].slots, { children: { accepts: 'any block' } })
    assert.equal(list[1].slots, 'none (cannot have children)')
    assert.deepEqual(list[1].props, [
      { name: 'text', type: 'text', required: true },
      { name: 'level', type: 'select', options: ['1', '2'] },
    ])
    assert.ok(list[1].example)
  })

  it('getBlockSchema returns JSON Schema and refuses unknown types', async () => {
    const { req } = fakeRequest()
    const schema = json(await tool('getBlockSchema').handler({ collection: 'pages', type: 'heading' }, req, {}))
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    const unknown = await tool('getBlockSchema').handler({ collection: 'pages', type: 'nope' }, req, {})
    assert.equal(unknown.isError, true)
  })

  it('getLayout reads the draft as the request user', async () => {
    const { req, calls } = fakeRequest({ version: 1, blocks: [{ id: 'a', type: 'heading', props: { text: 'X' } }] })
    const body = json(await tool('getLayout').handler({ collection: 'pages', id: 'p1' }, req, {}))
    assert.equal(body.title, 'Home')
    assert.equal((body.layout as Layout).blocks[0].id, 'a')
    assert.equal(calls[0].draft, true)
    assert.equal(calls[0].overrideAccess, false)
    assert.equal(calls[0].user, req.user)
    const missing = await tool('getLayout').handler({ collection: 'pages', id: 'zzz' }, req, {})
    assert.equal(missing.isError, true)
  })

  it('validateLayout checks a given layout or the saved draft', async () => {
    const { req } = fakeRequest()
    const bad = json(
      await tool('validateLayout').handler({ collection: 'pages', layout: { version: 1, blocks: [{ id: 'a', type: 'nope' }] } }, req, {}),
    )
    assert.equal(bad.valid, false)
    const draft = json(await tool('validateLayout').handler({ collection: 'pages', id: 'p1' }, req, {}))
    assert.equal(draft.valid, true)
    const missing = await tool('validateLayout').handler({ collection: 'pages' }, req, {})
    assert.equal(missing.isError, true)
  })

  it('getPreviewUrl returns absolute links', async () => {
    const { req } = fakeRequest()
    const previous = process.env.NEXT_PUBLIC_SERVER_URL
    delete process.env.NEXT_PUBLIC_SERVER_URL
    try {
      const body = json(await tool('getPreviewUrl').handler({ collection: 'pages', id: 'p1' }, req, {}))
      assert.deepEqual(
        { url: body.url, previewUrl: body.previewUrl, editorUrl: body.editorUrl },
        {
          url: 'http://site.test/home',
          previewUrl: 'http://site.test/preview/home',
          editorUrl: 'http://site.test/admin/collections/pages/p1/builder',
        },
      )
    } finally {
      if (previous !== undefined) process.env.NEXT_PUBLIC_SERVER_URL = previous
    }
  })
})

describe('write tools', () => {
  it('applyOperations saves a draft and publishes to open editors as the AI key', async () => {
    const { req, runtime, calls } = fakeRequest({ version: 1, blocks: [{ id: 'a', type: 'heading', props: { text: 'X' } }] })
    const events: BusMessage[] = []
    runtime.bus.subscribe(channelKey('pages', 'p1'), (m) => events.push(m))

    const result = await tool('applyOperations').handler(
      { collection: 'pages', id: 'p1', operations: [{ type: 'update', id: 'a', props: { text: 'Y' } }, { type: 'duplicate', id: 'a' }] },
      req,
      {},
    )
    const body = json(result)
    assert.equal(body.ok, true)
    const update = calls.find((c) => c.op === 'update')
    assert.equal(update?.draft, true)
    assert.equal(update?.overrideAccess, false)
    const event = events[0] as LiveOperationsEvent
    assert.deepEqual(event.actor, { type: 'ai', id: 'mcp-key:7', label: 'Claude Desktop' })
    // The duplicate (sent without newId) was given an id and broadcast as an insert.
    assert.deepEqual(event.ops.map((op) => op.type), ['update', 'insert'])
    assert.equal((body.changedIds as string[]).length, 2)
  })

  it('applyOperations reports a failing operation without saving', async () => {
    const { req, calls } = fakeRequest()
    const result = await tool('applyOperations').handler({ collection: 'pages', id: 'p1', operations: [{ type: 'remove', id: 'x' }] }, req, {})
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /Operation 0 \(remove\): Block "x" not found/)
    assert.equal(calls.filter((c) => c.op === 'update').length, 0)
  })

  it('insertSection inserts the section with new ids at the end by default', async () => {
    const { req } = fakeRequest({ version: 1, blocks: [{ id: 'a', type: 'heading', props: { text: 'X' } }] })
    const first = json(await tool('insertSection').handler({ collection: 'pages', id: 'p1', sectionId: 'hero' }, req, {}))
    const second = json(await tool('insertSection').handler({ collection: 'pages', id: 'p1', sectionId: 'hero', index: 0 }, req, {}))
    const layout = json(await tool('getLayout').handler({ collection: 'pages', id: 'p1' }, req, {})).layout as Layout
    const firstIds = first.insertedIds as string[]
    const secondIds = second.insertedIds as string[]
    assert.equal(firstIds.length, 2)
    assert.ok(![...firstIds, ...secondIds].some((id) => id === 'sec' || id === 'title'))
    assert.equal(new Set([...firstIds, ...secondIds]).size, 4)
    assert.deepEqual(
      layout.blocks.map((b) => b.id),
      [secondIds[0], 'a', firstIds[0]],
    )
    assert.equal(findBlock(layout, firstIds[1])?.props?.text, 'Welcome')

    const unknown = await tool('insertSection').handler({ collection: 'pages', id: 'p1', sectionId: 'nope' }, req, {})
    assert.equal(unknown.isError, true)
  })
})

describe('sectionInsertOps', () => {
  it('checks the target position', () => {
    const layout: Layout = { version: 1, blocks: [] }
    assert.equal(sectionInsertOps(layout, hero, { parentId: 'missing' }), 'Parent block "missing" not found')
    assert.equal(sectionInsertOps(layout, hero, { index: 3 }), 'Index 3 is out of range (0-0)')
    const ops = sectionInsertOps(layout, hero, {})
    assert.ok(Array.isArray(ops))
    assert.deepEqual(ops[0].type === 'insert' && ops[0].to, { parentId: null, slot: 'children', index: 0 })
  })
})

describe('template tools', () => {
  const withTemplates = builderMcpTools({
    blocks,
    collections: { posts: { templates: true, url: (doc) => `/blog/${String(doc.slug)}` }, pages: {} },
  })
  const named = (name: string) => withTemplates.find((t) => t.name === name)

  it('adds listTemplates and getBindingSources only when a collection uses templates', () => {
    assert.ok(named('listTemplates'))
    assert.ok(named('getBindingSources'))
    assert.ok(!tools.some((t) => t.name === 'listTemplates'))
  })

  it('accepts the templates collection in the layout tools', () => {
    const parsed = z.object(named('applyOperations')!.parameters).safeParse({
      collection: 'builder-templates',
      id: '1',
      operations: [{ type: 'update', id: 'h', bindings: { text: 'title' } }],
    })
    assert.ok(parsed.success)
  })

  it('getBindingSources reads the fields the plugin stored on the config', async () => {
    const fields = [{ path: 'title', label: 'Title', type: 'text' }]
    const req = {
      payload: { config: { custom: { websiteBuilderTemplates: { collection: 'builder-templates', targetField: 'targetCollection', sources: { posts: fields } } } } },
    } as unknown as PayloadRequest
    const result = await named('getBindingSources')!.handler({ collection: 'posts' }, req, {})
    assert.deepEqual(JSON.parse(result.content[0].text).fields, fields)
  })

  it('listTemplates lists templates with their target and default flag', async () => {
    const req = {
      user: { id: 1 },
      payload: {
        config: { routes: { admin: '/admin' } },
        async find(a: Record<string, unknown>) {
          assert.equal(a.collection, 'builder-templates')
          return { docs: [{ id: 5, name: 'Post template', targetCollection: 'posts', isDefault: true, _status: 'published', layout: { version: 1, blocks: [{ id: 'a', type: 'stack' }] } }] }
        },
      },
    } as unknown as PayloadRequest
    const result = await named('listTemplates')!.handler({ collection: 'builder-templates' }, req, {})
    const body = JSON.parse(result.content[0].text)
    assert.deepEqual(body.templates[0], {
      id: 5,
      name: 'Post template',
      target: 'posts',
      isDefault: true,
      status: 'published',
      blocks: 1,
      editorPath: '/admin/collections/builder-templates/5/builder',
    })
  })
})
