import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import { captureFieldSemantics } from '../core/fieldSemantics'
import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { HOOK_CHANGES_CONTEXT, layoutAfterChange, layoutAfterRead, layoutBeforeChange, RAW_LAYOUT_CONTEXT } from '../plugin/hook'
import { actorFromUser, type LiveDocStore } from './apply'
import { documentEndpoints } from './document'
import { propAccessCheck, validateBlockProps } from './fieldChecks'
import type { LiveRuntime } from './runtime'
import { createSessionManager, FIELD_HOOKS_ACTOR, hookChangeOps, type SessionTarget } from './session'
import type { LiveCommitEvent, LiveSavedEvent, MultiplayerEvent, PublishResponse } from './types'

type Doc = Record<string, unknown>

const slugify = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : value
const isAdmin = ({ req }: { req: { user?: { email?: string } | null } }) => req.user?.email === 'admin@x.test'

const blocks: BlockDefinition[] = [
  {
    type: 'product',
    label: 'Product',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'slug', type: 'text', hooks: { beforeChange: [({ value }: { value?: unknown }) => slugify(value)] } },
      { name: 'sku', type: 'text', validate: (value: unknown) => (value === undefined || /^[A-Z]{3}-\d{3}$/.test(String(value)) ? true : 'Use a SKU like ABC-123') },
      { name: 'note', type: 'text', access: { read: isAdmin } },
      { name: 'price', type: 'number', access: { update: isAdmin } },
      { name: 'shout', type: 'text', hooks: { afterRead: [({ value }: { value?: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value)] } },
    ] as unknown as Field[],
  },
]
const registry = captureFieldSemantics(blocks)
const page = (props: Doc): Layout => ({ version: 1, blocks: [{ id: 'p', type: 'product', props }] })
const propsOf = (layout: unknown) => findBlock(layout as Layout, 'p')?.props ?? {}
const admin = { id: 1, email: 'admin@x.test', name: 'Ana' }
const editor = { id: 2, email: 'editor@x.test', name: 'Bob' }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}
const logger = { info() {}, warn() {}, error() {} }
const css = { entry: 'does-not-exist.css' }
const target: SessionTarget = { collection: 'pages', id: 'p1', field: 'layout', drafts: true, autosave: true }

describe('hookChangeOps', () => {
  it('turns the values the hooks changed into update operations', () => {
    const input = page({ slug: 'Hello World', title: 'T', gone: 'x' })
    const output = page({ slug: 'hello-world', title: 'T' })
    assert.deepEqual(hookChangeOps(input, output, input), [{ type: 'update', id: 'p', props: { slug: 'hello-world' }, unsetProps: ['gone'] }])
  })

  it('leaves a prop someone changed since the save, and blocks that are gone', () => {
    const input = page({ slug: 'Hello World', title: 'T' })
    const output = page({ slug: 'hello-world', title: 'T' })
    assert.deepEqual(hookChangeOps(input, output, page({ slug: 'Hello World again', title: 'T' })), [])
    assert.deepEqual(hookChangeOps(input, output, page({ slug: 'Hello World', title: 'New' })), [{ type: 'update', id: 'p', props: { slug: 'hello-world' } }])
    assert.deepEqual(hookChangeOps(input, output, { version: 1, blocks: [] }), [])
  })
})

/**
 * A fake Local API whose `update` runs the real save hook and the after-change hook, with the
 * caller's `context` object as the request context (what Payload does without `req`).
 */
function hookedPayload(initial: Layout, options: { writeMs?: number } = {}) {
  const sessions = createSessionManager({ persistDebounceMs: 5, logger: { error() {} } })
  const before = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, sessions, fieldRegistry: registry })
  const after = layoutAfterChange({ collection: 'pages', sessions, props: { field: 'layout', blocks, registry } })
  let latest: Doc = { id: 'p1', layout: structuredClone(initial), _status: 'published', updatedAt: 't0' }
  let main: Doc = structuredClone(latest)
  const writes: Doc[] = []
  let stamp = 0
  const store = {
    collections: { pages: { config: { versions: { drafts: { autosave: true } } } } },
    async findByID(args: Doc) {
      return structuredClone(args.draft ? latest : main)
    },
    async update(args: Doc) {
      if (options.writeMs) await delay(options.writeMs)
      const context = (args.context as Doc) ?? {}
      const req = { user: args.user ?? null, payload: { logger }, t: (s: string) => s }
      const collection = { slug: 'pages', fields: [], versions: { drafts: true } }
      const data = await (before as unknown as (a: unknown) => Promise<Doc>)({
        collection,
        context,
        data: structuredClone(args.data as Doc),
        operation: 'update',
        originalDoc: structuredClone(latest),
        req,
      })
      writes.push(structuredClone(data))
      const previousDoc = latest
      const publishing = args.draft === false
      latest = { ...latest, ...data, _status: publishing ? (data._status ?? latest._status) : 'draft', updatedAt: `t${++stamp}` }
      if (publishing) main = structuredClone(latest)
      return (after as unknown as (a: unknown) => Promise<Doc>)({ collection, context, data, doc: structuredClone(latest), operation: 'update', previousDoc, req })
    },
  }
  const connect = async (clientId: string, user: unknown) => {
    const events: MultiplayerEvent[] = []
    await sessions.connect({ target, store: store as unknown as LiveDocStore, clientId, user, send: (event) => events.push(event) })
    return events
  }
  const commit = (ops: unknown[], user: unknown = admin, access?: Parameters<typeof sessions.commit>[0]['access']) =>
    sessions.commit({ target, store: store as unknown as LiveDocStore, user, actor: actorFromUser(user), blocks, ops, ...(access ? { access } : {}) })
  return {
    sessions,
    store,
    writes,
    connect,
    commit,
    get latest() {
      return latest
    },
  }
}

describe('hook changes reach every editor', () => {
  it('a session save runs beforeChange, and both editors get the stored value without a second save', async () => {
    const db = hookedPayload(page({ title: 'Shoe' }))
    const ana = await db.connect('tab-a', admin)
    const bob = await db.connect('tab-b', editor)
    const result = await db.commit([{ type: 'update', id: 'p', props: { slug: 'Red Shoe!' } }])
    assert.ok(result.ok)
    await delay(30)
    await settle()
    assert.equal(db.writes.length, 1)
    assert.equal(propsOf(db.latest.layout).slug, 'red-shoe')
    for (const events of [ana, bob]) {
      const fromHooks = events.find((e): e is LiveCommitEvent => e.type === 'commit' && e.actor.id === FIELD_HOOKS_ACTOR.id)
      assert.deepEqual(fromHooks?.ops, [{ type: 'update', id: 'p', props: { slug: 'red-shoe' } }])
      const saved = events.filter((e): e is LiveSavedEvent => e.type === 'saved').map((e) => e.seq)
      assert.deepEqual(saved, [1, 2], 'the hook commit counts as saved')
    }
    assert.equal(propsOf(db.sessions.peek('pages', 'p1')?.layout).slug, 'red-shoe')
    await delay(30)
    assert.equal(db.writes.length, 1, 'no second save of the same state')
  })

  it('keeps an edit made while the save ran, and saves again', async () => {
    const db = hookedPayload(page({ title: 'Shoe' }), { writeMs: 20 })
    await db.connect('tab-a', admin)
    await db.commit([{ type: 'update', id: 'p', props: { slug: 'First Try' } }])
    await delay(10) // the save is running
    await db.commit([{ type: 'update', id: 'p', props: { slug: 'Second Try' } }])
    await delay(120)
    await settle()
    assert.equal(propsOf(db.sessions.peek('pages', 'p1')?.layout).slug, 'second-try')
    assert.equal(propsOf(db.latest.layout).slug, 'second-try')
    assert.equal(db.writes.length, 2)
  })

  it('a save from outside the session (Publish, REST) brings its hook changes to the editors', async () => {
    const db = hookedPayload(page({ title: 'Shoe' }))
    const events = await db.connect('tab-a', admin)
    await db.commit([{ type: 'update', id: 'p', props: { slug: 'A B' } }])
    // Publish before the session's own save: the guard gives the save the session's layout.
    await db.store.update({ collection: 'pages', id: 'p1', data: { _status: 'published' }, draft: false, context: {}, user: admin })
    await delay(30)
    await settle()
    assert.equal(propsOf(db.latest.layout).slug, 'a-b')
    assert.equal(db.latest._status, 'published')
    const fromHooks = events.find((e): e is LiveCommitEvent => e.type === 'commit' && e.actor.id === FIELD_HOOKS_ACTOR.id)
    assert.deepEqual(fromHooks?.ops, [{ type: 'update', id: 'p', props: { slug: 'a-b' } }])
    assert.equal(propsOf(db.sessions.peek('pages', 'p1')?.layout).slug, 'a-b')
    assert.equal(db.writes.length, 1, 'the published state is not saved again as a draft')
  })

  it('the save hook records what the hooks changed in the context', async () => {
    const sessions = createSessionManager({ logger: { error() {} } })
    const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, sessions, fieldRegistry: registry })
    const context: Doc = {}
    await (hook as unknown as (a: unknown) => Promise<Doc>)({
      collection: { slug: 'pages', fields: [], versions: { drafts: true } },
      context,
      data: { layout: page({ slug: 'X Y' }) },
      operation: 'update',
      originalDoc: { id: 'p1', layout: page({}) },
      req: { payload: { logger }, t: (s: string) => s },
    })
    const changes = context[HOOK_CHANGES_CONTEXT] as { input: Layout; output: Layout }
    assert.equal(propsOf(changes.input).slug, 'X Y')
    assert.equal(propsOf(changes.output).slug, 'x-y')
  })
})

const runSave = (status: string, layout: Layout, context: Doc = {}) => {
  const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, fieldRegistry: registry })
  return (hook as unknown as (a: unknown) => Promise<Doc>)({
    collection: { slug: 'pages', fields: [], versions: { drafts: true } },
    context,
    data: { layout, _status: status },
    operation: 'update',
    originalDoc: { id: 'p1', layout: page({}), _status: 'draft' },
    req: { payload: { logger }, t: (s: string) => s, user: admin },
  })
}
const accessReq = (user: unknown) => ({ user, payload: { collections: {} } }) as never
const accessCheck = (user: unknown) => propAccessCheck(accessReq(user), { blocks, registry, collection: 'pages', id: 'p1', field: 'layout' })

describe('validate on save and publish', () => {
  it('a value the validate function refuses saves as a draft and blocks publishing', async () => {
    const saved = await runSave('draft', page({ sku: 'abc' }))
    assert.equal(propsOf(saved.layout).sku, 'abc')
    await assert.rejects(runSave('published', page({ sku: 'abc' })), (error: { data?: { errors?: { message: string }[] } }) => {
      assert.match(error.data?.errors?.[0]?.message ?? '', /Product: Sku: use a SKU like ABC-123/)
      return true
    })
    await runSave('published', page({ sku: 'ABC-123' }))
  })

  it('a publish without the layout in the data checks the stored layout', async () => {
    const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, fieldRegistry: registry })
    const call = (layout: Layout) =>
      (hook as unknown as (a: unknown) => Promise<Doc>)({
        collection: { slug: 'pages', fields: [], versions: { drafts: true } },
        context: {},
        data: { _status: 'published' },
        operation: 'update',
        originalDoc: { id: 'p1', layout, _status: 'draft' },
        req: { payload: { logger }, t: (s: string) => s },
      })
    await assert.rejects(call(page({ sku: 'nope' })))
    await call(page({ sku: 'ABC-123' }))
  })

  it('the publish endpoint names the block and the message', async () => {
    const db = hookedPayload(page({ sku: 'bad' }))
    const runtime: LiveRuntime = { sessions: db.sessions, canUpdate: async () => true }
    const endpoints = documentEndpoints({ collections: { pages: { field: 'layout' } }, templates: null, runtime, check: { blocks, fieldRegistry: registry } })
    const publish = endpoints.find((e) => e.path.endsWith('/publish'))!
    const response = (await publish.handler({ user: admin, payload: db.store, routeParams: { collection: 'pages', id: 'p1' } } as never)) as Response
    assert.equal(response.status, 422)
    const body = (await response.json()) as PublishResponse
    assert.ok(!body.ok)
    if (!body.ok) assert.deepEqual(body.errors?.map((e) => [e.blockId, e.code, e.message]), [['p', 'validate', 'Product: Sku: use a SKU like ABC-123']])
  })

  it('the inspector endpoint helper returns messages by prop path', async () => {
    const problems = await validateBlockProps({ user: admin, payload: { collections: {} } } as never, {
      blocks,
      registry,
      collection: 'pages',
      id: 'p1',
      field: 'layout',
      block: { id: 'p', type: 'product', props: { sku: 'x' } },
      doc: { id: 'p1' },
      layout: page({ sku: 'ABC-123' }),
    })
    assert.deepEqual(problems, [{ propPath: 'sku', message: 'Use a SKU like ABC-123' }])
  })
})

describe('field access on live edits and saves', () => {

  it('refuses a commit that changes a prop the user may not update, with a clear message', async () => {
    const db = hookedPayload(page({ title: 'Shoe', price: 20 }))
    await db.connect('tab-b', editor)
    const refused = await db.commit([{ type: 'update', id: 'p', props: { price: 1 } }], editor, accessCheck(editor))
    assert.ok(!refused.ok)
    if (!refused.ok) {
      assert.equal(refused.status, 403)
      assert.equal(refused.error, 'You cannot change Price (Product). Nothing was applied.')
    }
    assert.equal(propsOf(db.sessions.peek('pages', 'p1')?.layout).price, 20)
    assert.ok((await db.commit([{ type: 'update', id: 'p', props: { title: 'Boot' } }], editor, accessCheck(editor))).ok)
    assert.ok((await db.commit([{ type: 'update', id: 'p', props: { price: 30 } }], admin, accessCheck(admin))).ok)
    // A duplicate copies the value: allowed.
    const copy = { type: 'insert', block: { id: 'p2', type: 'product', props: { price: 30 } }, to: { parentId: null, slot: 'children', index: 1 } }
    assert.ok((await db.commit([copy], editor, accessCheck(editor))).ok)
  })

  it('a REST save keeps the saved value of a prop the user may not update, unless access is overridden', async () => {
    const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, fieldRegistry: registry })
    const call = (overrideAccess: boolean) =>
      (hook as unknown as (a: unknown) => Promise<Doc>)({
        collection: { slug: 'pages', fields: [], versions: { drafts: true } },
        // Set by the layout field's beforeValidate hook (recordOverrideAccess).
        context: { builderOverrideAccess: overrideAccess },
        data: { layout: page({ price: 1, title: 'New' }) },
        operation: 'update',
        originalDoc: { id: 'p1', layout: page({ price: 20, title: 'Old', note: 'secret' }) },
        req: { payload: { logger }, t: (s: string) => s, user: editor },
      })
    assert.deepEqual(propsOf((await call(false)).layout), { price: 20, title: 'New', note: 'secret' })
    assert.deepEqual(propsOf((await call(true)).layout), { price: 1, title: 'New' })
  })

  it('API reads run afterRead hooks and leave out props the user may not read; raw reads do not', async () => {
    const hook = layoutAfterRead({ field: 'layout', blocks, registry })
    const read = (user: unknown, extra: Doc = {}) =>
      (hook as unknown as (a: unknown) => Promise<unknown>)({
        value: page({ note: 'secret', shout: 'hey', title: 'T' }),
        data: { id: 'p1' },
        req: { user },
        context: {},
        overrideAccess: false,
        ...extra,
      })
    assert.deepEqual(propsOf(await read(editor)), { shout: 'HEY', title: 'T' })
    assert.deepEqual(propsOf(await read(admin)), { note: 'secret', shout: 'HEY', title: 'T' })
    assert.deepEqual(propsOf(await read(editor, { overrideAccess: true })), { note: 'secret', shout: 'HEY', title: 'T' })
    assert.deepEqual(propsOf(await read(editor, { context: { [RAW_LAYOUT_CONTEXT]: true } })), { note: 'secret', shout: 'hey', title: 'T' })
  })
})

describe('publishing a migrated document', () => {
  it('keeps the published value of the legacy fields', async () => {
    const writes: Doc[] = []
    let main: Doc = { id: 'p1', layout: [{ blockType: 'old', text: 'published old' }], builder: page({}), _status: 'published' }
    let latest: Doc = { ...main, layout: [{ blockType: 'old', text: 'newer draft' }], builder: page({ title: 'New' }), _status: 'draft' }
    const payload = {
      collections: { pages: { config: { versions: { drafts: true } } } },
      async findByID(args: Doc) {
        return structuredClone(args.draft ? latest : main)
      },
      async update({ req: _req, user: _user, ...args }: Doc) {
        writes.push(structuredClone(args))
        main = { ...latest, ...(args.data as Doc) }
        latest = structuredClone(main)
        return structuredClone(main)
      },
    }
    const sessions = createSessionManager({ logger: { error() {} } })
    const runtime: LiveRuntime = { sessions, canUpdate: async () => true }
    const endpoints = documentEndpoints({ collections: { pages: { field: 'builder', legacyFields: ['layout'] } }, templates: null, runtime })
    const publish = endpoints.find((e) => e.path.endsWith('/publish'))!
    const response = (await publish.handler({ user: admin, payload, routeParams: { collection: 'pages', id: 'p1' } } as never)) as Response
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
    const data = writes.at(-1)?.data as Doc
    assert.deepEqual(data, { layout: [{ blockType: 'old', text: 'published old' }], _status: 'published' })
    assert.deepEqual(main.layout, [{ blockType: 'old', text: 'published old' }])
    assert.equal(propsOf(main.builder).title, 'New')
  })

  it('publishes the old field as it is when the document was never published', async () => {
    const writes: Doc[] = []
    const doc: Doc = { id: 'p1', layout: [{ blockType: 'old' }], builder: page({}), _status: 'draft' }
    const payload = {
      collections: { pages: { config: { versions: { drafts: true } } } },
      findByID: async () => structuredClone(doc),
      async update({ req: _req, user: _user, ...args }: Doc) {
        writes.push(structuredClone(args))
        return { ...doc, ...(args.data as Doc) }
      },
    }
    const runtime: LiveRuntime = { sessions: createSessionManager({ logger: { error() {} } }), canUpdate: async () => true }
    const endpoints = documentEndpoints({ collections: { pages: { field: 'builder', legacyFields: ['layout'] } }, templates: null, runtime })
    const publish = endpoints.find((e) => e.path.endsWith('/publish'))!
    await publish.handler({ user: admin, payload, routeParams: { collection: 'pages', id: 'p1' } } as never)
    assert.deepEqual(writes.at(-1)?.data, { _status: 'published' })
  })
})
