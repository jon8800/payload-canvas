// One source of truth, through the real Payload Local API: a collection whose builder field is its
// own Payload blocks field. Payload's operations, field hooks, validation, access, locales and
// versions run as in an app; only the database is in memory (memoryAdapter.test-data.ts).

import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { buildConfig, createPayloadRequest, getPayload, handleEndpoints, type Block, type CollectionConfig, type Payload, type PayloadRequest, type Where } from 'payload'

import { autosaveAction } from '../admin/editor/topbar/closeSave'
import { fromPayloadBlocks } from '../blocks/payload'
import { encodePayloadBlocks, type PayloadBlocksStorage } from '../core/payloadBlocks'
import type { Layout } from '../core/types'
import { BUILDER_CONFIG_KEY, runPublishAction, type BuilderServerConfig } from '../live/document'
import { builderMcpTools } from '../mcp'
import { LIVE_PATH, sessionTargetOf } from '../live/endpoints'
import { liveRuntimeOf } from '../live/runtime'
import type { LiveDocStore } from '../live/apply'
import type { MultiplayerEvent } from '../live/types'
import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

/** How often the heading's `text` hook ran: Payload's own field hooks run once per save. */
let textHookRuns = 0
/** While set, the heading's `text` read access waits for it (tests hold an event stream's check). */
let holdTextRead: Promise<void> | null = null

const heading: Block = {
  slug: 'heading',
  fields: [
    {
      name: 'text',
      type: 'text',
      localized: true,
      access: {
        read: async ({ req, doc }) => {
          // A test holds the editor's checks here (an admin's own reads go on).
          if (holdTextRead && (req.user as { role?: string } | null)?.role === 'editor') await holdTextRead
          // Private pages show their headings to admins only.
          return (req.user as { role?: string } | null)?.role === 'admin' || !(doc as { private?: boolean } | undefined)?.private
        },
      },
      hooks: {
        beforeChange: [
          ({ value }) => {
            textHookRuns += 1
            return value
          },
        ],
      },
    },
    { name: 'level', type: 'select', options: ['h2', 'h3'] },
    // Not in the builder's inspector: kept as stored. Its own validate function (always valid)
    // makes the live validate endpoint run for headings.
    { name: 'note', type: 'text', admin: { hidden: true }, validate: () => true as const },
    // Only admins and reviewers may read it.
    { name: 'secret', type: 'text', access: { read: ({ req }) => ['admin', 'reviewer'].includes(String((req.user as { role?: string } | null)?.role)) } },
    // Hidden from everyone while its sibling flag says so.
    { name: 'private', type: 'checkbox' },
    { name: 'confidential', type: 'text', access: { read: ({ siblingData }) => !(siblingData as { private?: boolean } | undefined)?.private } },
    // Payload's hook stores it in capitals.
    {
      name: 'tone',
      type: 'text',
      hooks: { beforeChange: [({ value }) => (typeof value === 'string' ? value.toUpperCase() : value)] },
    },
  ],
}
const gallery: Block = {
  slug: 'gallery',
  fields: [
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'caption', type: 'text' },
        { name: 'image', type: 'relationship', relationTo: 'media' },
      ],
    },
    {
      name: 'settings',
      type: 'group',
      fields: [
        { name: 'columns', type: 'number' },
        { name: 'tagline', type: 'text' },
      ],
    },
  ],
}
const section: Block = {
  slug: 'section',
  fields: [
    { name: 'background', type: 'text' },
    { name: 'content', type: 'blocks', blocks: [heading, gallery] },
  ],
}

const signedIn = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)
/** Viewers may read published pages only (Payload's draft read then falls back to the published version). */
const readPages = ({ req }: { req: { user?: unknown } }) =>
  (req.user as { role?: string } | null)?.role === 'viewer' ? (viewerReadsDrafts ? true : { _status: { equals: 'published' } }) : Boolean(req.user)
/** While set, viewers may read drafts too (a test takes it away again). */
let viewerReadsDrafts = false
/** While set, the live session's own saves fail (a hook refuses them). */
let failSessionSaves = false
const users: CollectionConfig = { slug: 'users', auth: true, fields: [{ name: 'role', type: 'text' }] }
const media: CollectionConfig = { slug: 'media', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] }
const pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  access: { read: readPages as never, readVersions: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  hooks: {
    // Tests hold a save here (inside the write gate) with `context.hold`.
    beforeChange: [
      async ({ context, data }) => {
        if (failSessionSaves && context.builderSession) throw new Error('The session save was refused by a hook.')
        const hold = context.hold as { entered: () => void; wait: Promise<void> } | undefined
        if (hold) {
          hold.entered()
          await hold.wait
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'heroTitle', type: 'text', localized: true },
    { name: 'private', type: 'checkbox' },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [section, heading],
      // A heading that says "ADD GENERATED" makes the hook add a generated heading at the end, once.
      hooks: {
        beforeChange: [
          ({ value }) => {
            if (!Array.isArray(value)) return value
            const rowsOf = (list: Row[]): Row[] => list.flatMap((r) => [r, ...(Array.isArray(r.content) ? rowsOf(r.content as Row[]) : [])])
            const all = rowsOf(value as Row[])
            if (!all.some((r) => r.text === 'ADD GENERATED') || all.some((r) => r.note === 'generated')) return value
            return [...value, { blockType: 'heading', text: 'Generated', note: 'generated' }]
          },
        ],
      },
      // Reviewers may update the page, but not its blocks.
      access: { update: ({ req }) => (req.user as { role?: string } | null)?.role !== 'reviewer' },
    },
  ],
}

const admin = { id: 1, collection: 'users', email: 'admin@example.test', role: 'admin' }
const editor = { id: 2, collection: 'users', email: 'editor@example.test', role: 'editor' }
const reviewer = { id: 3, collection: 'users', email: 'reviewer@example.test', role: 'reviewer' }
const viewer = { id: 4, collection: 'users', email: 'viewer@example.test', role: 'viewer' }

type RuleUser = { role?: string; tenant?: string; email?: string }
/** Notes: a tenant rule (no status in it) and an "author or published" rule. */
const notes: CollectionConfig = {
  slug: 'notes',
  versions: { drafts: true },
  access: {
    read: ({ req }): Where | boolean => {
      const user = req.user as RuleUser | null
      if (user?.role === 'tenant') return { tenant: { equals: user.tenant } }
      if (user?.role === 'author') return { or: [{ _status: { equals: 'published' } }, { author: { equals: user.email } }] }
      return Boolean(user)
    },
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'tenant', type: 'text' },
    { name: 'author', type: 'text' },
  ],
}

/** A collection with the builder's own JSON layout, for the JSON-mode regressions. */
const posts: CollectionConfig = {
  slug: 'posts',
  versions: { drafts: true },
  access: { read: readPages as never, readVersions: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  hooks: {
    beforeChange: [
      async ({ context, data }) => {
        const hold = context.hold as { entered: () => void; wait: Promise<void> } | undefined
        if (hold) {
          hold.entered()
          await hold.wait
        }
        return data
      },
    ],
  },
  fields: [{ name: 'title', type: 'text' }],
}

const mem = memoryAdapter()
let payload: Payload
let mediaId: number

/** The stored page as Payload reads it (draft, depth 0, the given locale). */
const read = async (id: number, locale = 'en') =>
  (await payload.findByID({ collection: 'pages', id, depth: 0, draft: true, locale: locale as never, overrideAccess: true })) as unknown as Record<string, unknown>

/** The rows of the stored layout without Payload's read-only extras. */
type Row = Record<string, unknown>
const rows = (doc: Record<string, unknown>) => doc.layout as Row[]

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve))
}

async function createPage(options: { secret?: boolean } = {}): Promise<number> {
  const doc = await payload.create({
    collection: 'pages',
    draft: true,
    overrideAccess: true,
    data: {
      title: 'Home',
      heroTitle: 'Welcome',
      layout: [
        {
          blockType: 'section',
          blockName: 'Intro',
          background: 'dark',
          content: [
            { blockType: 'heading', text: 'Hello', level: 'h2', note: 'keep me', ...(options.secret === false ? {} : { secret: 's3cret' }) },
            {
              blockType: 'gallery',
              items: [
                { caption: 'First', image: mediaId },
                { caption: null, image: null },
              ],
              settings: { columns: 3, tagline: null },
            },
          ],
        },
        { blockType: 'heading', text: 'Bottom', level: null },
      ],
    } as never,
  })
  const id = doc.id as number
  // A French translation of the headings, through Payload's editor (same block ids).
  const en = rows(await read(id))
  const fr = structuredClone(en)
  ;((fr[0].content as Row[])[0] as Row).text = 'Bonjour'
  fr[1].text = 'Bas'
  await payload.update({ collection: 'pages', id, draft: true, locale: 'fr', overrideAccess: true, data: { layout: fr, heroTitle: 'Bienvenue' } as never })
  return id
}

function openSession(id: number, user: unknown = editor) {
  const server = payload.config.custom?.[BUILDER_CONFIG_KEY] as BuilderServerConfig
  const target = sessionTargetOf(payload, server.collections as never, 'pages', String(id))
  assert.ok(target)
  const events: MultiplayerEvent[] = []
  const runtime = liveRuntimeOf(payload)
  const store = payload as unknown as LiveDocStore
  return {
    target,
    events,
    runtime,
    connect: () => runtime.sessions.connect({ target, store, clientId: `c-${id}-${String((user as { id: number }).id)}`, user, send: (event) => events.push(event) }),
    commit: (ops: unknown[]) =>
      runtime.sessions.commit({ target, store, user, actor: { type: 'user', id: 'users:2', label: 'Editor' }, ops, blocks: [...server.collections.pages.payloadBlocks!.blocks] }),
    flush: () => runtime.sessions.flush('pages', id),
    layout: () => runtime.sessions.peek('pages', id)?.layout as Layout,
  }
}

before(async () => {
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: mem.adapter,
    localization: { locales: ['en', 'fr'], defaultLocale: 'en', fallback: true },
    collections: [users, media, pages, posts, notes],
    plugins: [
      websiteBuilder({
        collections: { pages: { regions: [{ name: 'hero', fields: ['heroTitle'] }] }, posts: {}, notes: {} },
        blocks: fromPayloadBlocks([section, heading, gallery], { onWarning: false }),
        css: { entry: 'globals.css' },
        theme: false,
      }),
    ],
  })
  payload = await getPayload({ config })
  mediaId = (await payload.create({ collection: 'media', data: { name: 'Photo' } as never, overrideAccess: true })).id as number
})

after(async () => {
  await liveRuntimeOf(payload).sessions.flushAll?.()
})

describe('Payload blocks field: the plugin keeps the collection as it is', () => {
  it('adds no second copy of the body: the blocks field is the only layout field, unchanged', () => {
    const config = payload.collections.pages.config
    const layout = config.fields.find((f) => 'name' in f && f.name === 'layout') as { type: string; blocks: unknown[]; admin?: { components?: unknown } }
    assert.equal(layout.type, 'blocks')
    assert.deepEqual(
      layout.blocks.map((b) => (b as { slug: string }).slug),
      ['section', 'heading'],
    )
    assert.equal(layout.admin?.components, undefined, "Payload's own blocks editor")
    const names = config.flattenedFields.map((f) => f.name)
    assert.ok(!names.includes('layoutCss'), 'no CSS copy')
    // The builder's config travels in a virtual field: no column, nothing stored.
    const builder = config.flattenedFields.find((f) => f.name === 'layoutBuilder') as { type: string; virtual?: unknown }
    assert.equal(builder.type, 'json')
    assert.equal(builder.virtual, true)
    const server = payload.config.custom?.[BUILDER_CONFIG_KEY] as BuilderServerConfig
    assert.deepEqual(server.collections.pages.payloadBlocks?.rootTypes, ['section', 'heading'])
    assert.equal(server.collections.pages.localization, null, "translations are edited in Payload's editor")
  })
})

describe('Payload blocks field: one source of truth through the Local API', () => {
  it('opens what Payload stored, losslessly, and opening alone saves nothing', async () => {
    const id = await createPage()
    const writes = mem.writes('pages')
    const versions = mem.versions('pages').length
    const session = openSession(id)
    await session.connect()
    const layout = session.layout()
    const stored = rows(await read(id))
    const [intro, bottom] = layout.blocks
    assert.equal(intro.type, 'section')
    assert.equal(intro.id, stored[0].id)
    assert.equal(intro.label, 'Intro')
    assert.equal(intro.props?.background, 'dark')
    const [hello, photos] = intro.slots?.content ?? []
    assert.deepEqual(hello.props, { text: 'Hello', level: 'h2', note: 'keep me', secret: 's3cret' })
    assert.equal(photos.type, 'gallery')
    const items = photos.props?.items as Row[]
    assert.equal(items[0].image, mediaId, 'relationships stay ids')
    assert.equal(items[1].caption, null, 'empty values stay')
    assert.equal(typeof items[0].id, 'string', 'array rows keep their ids')
    assert.deepEqual(photos.props?.settings, { columns: 3, tagline: null })
    assert.equal(bottom.props?.level, null)
    await settle()
    assert.equal(mem.writes('pages'), writes, 'no save on open')
    assert.equal(mem.versions('pages').length, versions, 'no version on open')
  })

  it('saves a canvas edit into the same field, keeping everything else, every locale and the hooks once', async () => {
    const id = await createPage()
    const original = rows(await read(id))
    const session = openSession(id)
    await session.connect()
    const hello = session.layout().blocks[0].slots!.content[0]
    textHookRuns = 0
    const result = await session.commit([{ type: 'update', id: hello.id, props: { text: 'Hello there' } }])
    assert.equal(result.ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    const saved = rows(await read(id))
    const expected = structuredClone(original)
    ;((expected[0].content as Row[])[0] as Row).text = 'Hello there'
    assert.deepEqual(saved, expected, 'ids, order, blockName, nulls, array rows, groups and relationship ids as they were')
    const fr = rows(await read(id, 'fr'))
    assert.equal(((fr[0].content as Row[])[0] as Row).text, 'Bonjour', 'the French text stays')
    assert.equal(fr[1].text, 'Bas')
    assert.equal(textHookRuns, 2, "Payload's field hook ran once for each heading")
    const stored = mem.stored('pages', id) as Record<string, unknown>
    assert.ok(stored.layoutBuilder == null && !('layoutCss' in stored), `nothing else stored: ${JSON.stringify(stored.layoutBuilder)}`)
    // Payload's own editor reads the canvas edit at once.
    const native = await payload.findByID({ collection: 'pages', id, draft: true, depth: 0, user: editor, overrideAccess: false })
    assert.equal(((native.layout as Row[])[0].content as Row[])[0].text, 'Hello there')
  })

  it('saves a block added on the canvas as a Payload block, nested in its section', async () => {
    const id = await createPage()
    const session = openSession(id)
    await session.connect()
    const intro = session.layout().blocks[0]
    const result = await session.commit([
      { type: 'insert', block: { id: 'new-heading', type: 'heading', props: { text: 'Added', level: 'h3' } }, to: { parentId: intro.id, slot: 'content', index: 1 } },
    ])
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(await session.flush(), { ok: true })
    const content = rows(await read(id))[0].content as Row[]
    assert.deepEqual(
      content.map((r) => [r.blockType, r.id]),
      [
        ['heading', content[0].id],
        ['heading', 'new-heading'],
        ['gallery', content[2].id],
      ],
    )
    assert.equal(content[1].text, 'Added')
  })

  it('takes a save from Payload while the canvas is open, and keeps the canvas edit made meanwhile', async () => {
    const id = await createPage()
    const session = openSession(id)
    await session.connect()
    const [intro, bottom] = session.layout().blocks
    const photos = intro.slots!.content[1]
    // A canvas edit, not saved yet.
    assert.equal((await session.commit([{ type: 'update', id: photos.id, props: { settings: { columns: 4, tagline: null } } }])).ok, true)
    // Someone saves the page in Payload's editor (the Local API as that user).
    const native = rows(await read(id))
    native[1].text = 'Bottom, edited in Payload'
    await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { layout: native } as never })
    await settle()
    // The canvas shows it at once, without dropping its own edit…
    const shown = session.layout()
    assert.equal(shown.blocks[1].id, bottom.id)
    assert.equal(shown.blocks[1].props?.text, 'Bottom, edited in Payload')
    assert.deepEqual(shown.blocks[0].slots!.content[1].props?.settings, { columns: 4, tagline: null })
    assert.ok(
      session.events.some((e) => e.type === 'session'),
      'editors get the new state',
    )
    // …and its next save writes both.
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = rows(await read(id))
    assert.equal(stored[1].text, 'Bottom, edited in Payload')
    assert.deepEqual(((stored[0].content as Row[])[1] as Row).settings, { columns: 4, tagline: null })
  })

  it('saves the hero region and the body of one document without undoing each other', async () => {
    const id = await createPage()
    const session = openSession(id)
    await session.connect()
    const hello = session.layout().blocks[0].slots!.content[0]
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Body edit' } }])).ok, true)
    // The hero region saves its field alone (as the region endpoint does).
    await payload.update({ collection: 'pages', id, draft: true, user: editor, overrideAccess: false, data: { heroTitle: 'New hero' } as never })
    await settle()
    // Editors hear which field changed (its old publish problem goes, admin/editor/topbar/problems.ts).
    assert.ok(session.events.some((e) => e.type === 'saved' && (e as { fields?: string[] }).fields?.includes('heroTitle')))
    assert.deepEqual(await session.flush(), { ok: true })
    const doc = await read(id)
    assert.equal(doc.heroTitle, 'New hero')
    assert.equal(((rows(doc)[0].content as Row[])[0] as Row).text, 'Body edit')
    assert.equal((await read(id, 'fr')).heroTitle, 'Bienvenue')
  })

  it('refuses what the field cannot store, and saves nothing of it', async () => {
    const id = await createPage()
    const session = openSession(id)
    await session.connect()
    const hello = session.layout().blocks[0].slots!.content[0]
    for (const op of [
      { type: 'update', id: hello.id, className: 'text-red-500' },
      { type: 'update', id: hello.id, hidden: true },
      { type: 'insert', block: { id: 'x1', type: 'gallery' }, to: { parentId: null, index: 0 } },
    ]) {
      const result = await session.commit([op])
      assert.equal(result.ok, false, JSON.stringify(op))
      assert.equal((result as { status: number }).status, 422, JSON.stringify(result))
    }
    assert.equal(session.layout().blocks.length, 2)
  })

  it("a stale form that left the blocks as loaded keeps the canvas edit; one that changed them is refused", async () => {
    const id = await createPage()
    // The settings drawer loads the page…
    const form = await read(id)
    const session = openSession(id)
    await session.connect()
    const hello = session.layout().blocks[0].slots!.content[0]
    // …the same person edits the canvas, which saves…
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Canvas edit' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    // …then the drawer autosaves the title, sending the blocks it loaded.
    await payload.update({
      collection: 'pages',
      id,
      draft: true,
      user: editor,
      overrideAccess: false,
      data: { ...form, title: 'Renamed', layout: form.layout } as never,
    })
    let doc = await read(id)
    assert.equal(doc.title, 'Renamed')
    assert.equal(((rows(doc)[0].content as Row[])[0] as Row).text, 'Canvas edit', 'the blocks left as loaded keep the newer blocks')
    // A form that changed the blocks after they changed elsewhere is refused (409).
    const changed = structuredClone(form.layout) as Row[]
    changed[1].text = 'Stale edit'
    await assert.rejects(
      payload.update({ collection: 'pages', id, draft: true, user: editor, overrideAccess: false, data: { ...form, layout: changed } as never }),
      (error: { status?: number }) => error.status === 409,
    )
    doc = await read(id)
    assert.equal(rows(doc)[1].text, 'Bottom')
  })

  it("keeps fields the user may not read, and Payload's own access refuses users without update access", async () => {
    const id = await createPage()
    // Payload's editor as the editor, who cannot read `secret`: the stored secret stays.
    const seen = (await payload.findByID({ collection: 'pages', id, draft: true, depth: 0, user: editor, overrideAccess: false })) as Record<string, unknown>
    const hello = ((seen.layout as Row[])[0].content as Row[])[0]
    assert.equal(hello.secret, undefined, 'hidden from the editor')
    hello.text = 'Edited without the secret'
    await payload.update({ collection: 'pages', id, draft: true, user: editor, overrideAccess: false, data: { layout: seen.layout } as never })
    const stored = ((rows(await read(id))[0].content as Row[])[0] as Row)
    assert.equal(stored.text, 'Edited without the secret')
    assert.equal(stored.secret, 's3cret', 'kept by Payload')
    // No user: Payload refuses.
    await assert.rejects(payload.update({ collection: 'pages', id, draft: true, overrideAccess: false, data: { title: 'x' } as never }))
  })
})

/** A request as `user`, for the live endpoint of page `id` when given. */
const requestAs = async (user: unknown, id?: number) => {
  const req = (await createPayloadRequest({ user: user as never, payload })) as PayloadRequest
  if (id !== undefined) {
    req.routeParams = { collection: 'pages', id: String(id) }
    ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/pages/${id}/events?clientId=client-${String((user as { id: number }).id)}`
  }
  return req
}
/** The published page. */
const published = async (id: number) =>
  (await payload.findByID({ collection: 'pages', id, depth: 0, draft: false, overrideAccess: true })) as unknown as Record<string, unknown>

describe('Payload blocks field: publish, revert and who may open the builder', () => {
  it('publishes the canvas edit and reverts to it, in the same field, keeping hidden values', async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const hello = session.layout().blocks[0].slots!.content[0]
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Published text' } }])).ok, true)
    const runtime = liveRuntimeOf(payload)
    const publish = await runPublishAction(await requestAs(admin), { target: session.target, action: 'publish', runtime })
    assert.equal(publish.ok, true, JSON.stringify(publish))
    let live = await published(id)
    assert.equal(live._status, 'published')
    assert.equal(((rows(live)[0].content as Row[])[0] as Row).text, 'Published text')
    assert.equal(((rows(live)[0].content as Row[])[0] as Row).secret, 's3cret')
    // A later draft edit, then Revert to published.
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Draft text' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    assert.equal(((rows(await read(id))[0].content as Row[])[0] as Row).text, 'Draft text')
    const revert = await runPublishAction(await requestAs(admin), { target: session.target, action: 'revert', runtime })
    assert.equal(revert.ok, true, JSON.stringify(revert))
    assert.equal(session.layout().blocks[0].slots!.content[0].props?.text, 'Published text', 'the canvas shows the published blocks')
    const draft = await read(id)
    assert.equal(((rows(draft)[0].content as Row[])[0] as Row).text, 'Published text')
    live = await published(id)
    assert.deepEqual(rows(draft), rows(live))
    // Every version holds the blocks field only: no second copy of the body.
    for (const record of mem.versions('pages').filter((r) => r.parent === id)) {
      assert.ok(Array.isArray(record.version.layout))
      assert.equal(record.version.layoutCss, undefined)
    }
  })

  it('opens the builder only for users who may read every block field', async () => {
    const id = await createPage()
    const events = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/events` && e.method === 'get')
    assert.ok(events)
    const refused = await events.handler(await requestAs(editor, id))
    assert.equal(refused.status, 403)
    assert.match(String(((await refused.json()) as { error: string }).error), /Payload's editor/)
    const opened = await events.handler(await requestAs(admin, id))
    assert.equal(opened.status, 200)
    await opened.body?.cancel()
  })
})

/** A live endpoint (`/builder/live/:collection/:id/<name>`) called as `user` with `body`. */
async function callLive(name: string, user: unknown, id: number, body: Record<string, unknown> = {}): Promise<Response> {
  const endpoint = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/${name}` && e.method === 'post')
  assert.ok(endpoint, name)
  const req = await requestAs(user, id)
  req.data = body
  return endpoint.handler(req)
}

const headingOf = (layout: Layout) => layout.blocks[0].slots!.content[0]
const storedHeading = async (id: number) => (rows(await read(id))[0].content as Row[])[0] as Row

describe('Payload blocks field: review regressions', () => {
  it('keeps an unsaved canvas edit through two saves from Payload before the canvas saves', async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Canvas' } }])).ok, true)
    for (const text of ['Native one', 'Native two']) {
      const native = rows(await read(id))
      native[1].text = text
      await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { layout: native } as never })
      await settle()
      assert.equal(headingOf(session.layout()).props?.text, 'Canvas', `after "${text}"`)
    }
    assert.deepEqual(await session.flush(), { ok: true })
    assert.equal((await storedHeading(id)).text, 'Canvas')
    assert.equal(rows(await read(id))[1].text, 'Native two')
  })

  it("shows what Payload's hooks stored, and a later edit keeps it", async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { tone: 'Mixed Case' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    await settle()
    assert.equal((await storedHeading(id)).tone, 'MIXED CASE')
    assert.equal(headingOf(session.layout()).props?.tone, 'MIXED CASE', 'the session holds the stored value')
    assert.ok(
      session.events.some((e) => e.type === 'session' && JSON.stringify(e).includes('MIXED CASE')),
      'editors get the stored state',
    )
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Later' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = await storedHeading(id)
    assert.equal(stored.text, 'Later')
    assert.equal(stored.tone, 'MIXED CASE')
  })

  it('refuses changes from a user who may update the page but not its blocks field', async () => {
    const id = await createPage()
    const hello = await storedHeading(id)
    const ops = [{ type: 'update', id: hello.id, props: { text: 'Denied' } }]
    assert.equal((await callLive('operations', reviewer, id, { ops })).status, 403)
    assert.equal((await callLive('commit', reviewer, id, { clientId: 'client-reviewer-1', batchId: 'b1', ops })).status, 403)
    assert.equal((await callLive('flush', reviewer, id)).status, 403)
    const open = liveRuntimeOf(payload).sessions.peek('pages', id)
    if (open) assert.notEqual(headingOf(open.layout).props?.text, 'Denied', 'nothing in the session')
    assert.equal((await storedHeading(id)).text, 'Hello')
  })

  it('never returns stored values the user may not read from the operations endpoint', async () => {
    const id = await createPage()
    const hello = await storedHeading(id)
    const ops = [{ type: 'update', id: hello.id, props: { text: 'Public' } }]
    const refused = await callLive('operations', editor, id, { ops })
    assert.equal(refused.status, 403)
    assert.ok(!(await refused.text()).includes('s3cret'))
    assert.equal(liveRuntimeOf(payload).sessions.peek('pages', id), null, 'no session opened for it')
    const allowed = await callLive('operations', admin, id, { ops })
    assert.equal(allowed.status, 200)
    const body = (await allowed.json()) as { layout: Layout }
    assert.equal(headingOf(body.layout).props?.text, 'Public')
  })

  it('does not lock when Revert starts while a canvas save waits behind a save from Payload', { timeout: 10_000 }, async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Canvas' } }])).ok, true)
    let entered!: () => void
    let release!: () => void
    const inside = new Promise<void>((resolve) => (entered = resolve))
    const wait = new Promise<void>((resolve) => (release = resolve))
    const native = rows(await read(id))
    native[1].text = 'Native'
    // A save from Payload holds the write gate…
    const nativeSave = payload.update({
      collection: 'pages',
      id,
      draft: true,
      user: admin,
      overrideAccess: false,
      data: { layout: native } as never,
      context: { hold: { entered, wait } },
    })
    await inside
    // …the canvas save waits for it, and Revert starts.
    const flushed = session.flush()
    const reset = liveRuntimeOf(payload).sessions.reset('pages', id, session.layout())
    release()
    await nativeSave
    assert.deepEqual(await flushed, { ok: true })
    assert.equal(await reset, true)
    // The gate is free: the next saves go through.
    await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { title: 'After' } as never })
    assert.equal((await read(id)).title, 'After')
  })
})

/** Reads SSE frames from a stream until `stop` says so or the stream ends. Returns every frame's text. */
async function readFrames(response: Response, stop: (frames: string[]) => boolean): Promise<string[]> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const frames: string[] = []
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    frames.push(...parts)
    if (stop(frames)) break
  }
  await reader.cancel().catch(() => undefined)
  return frames
}

describe('Payload blocks field: r2 review regressions', () => {
  it('never sends a value the user may not read that exists only in the live session', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const hello = await storedHeading(id)
    assert.equal(hello.secret, undefined, 'nothing secret stored')
    // The editor connects first (nothing secret anywhere yet).
    const events = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/events` && e.method === 'get')!
    const stream = await events.handler(await requestAs(editor, id))
    assert.equal(stream.status, 200)
    const frames = readFrames(stream, (all) => all.some((f) => f.startsWith('event: error')))
    // An admin types a secret on the canvas; it is not saved yet.
    const session = openSession(id, admin)
    await session.connect()
    assert.equal((await session.commit([{ type: 'update', id: String(hello.id), props: { secret: 'live-only' } }])).ok, true)
    assert.equal((await storedHeading(id)).secret, undefined, 'still not stored')
    // The editor's stream ends with an error instead of the commit.
    const sent = await frames
    assert.ok(sent.some((f) => f.startsWith('event: error')), 'the stream ends')
    assert.ok(!sent.some((f) => f.includes('live-only')), 'the live value never went out')
    // A public edit through the operations endpoint is refused, without the value.
    const operations = await callLive('operations', editor, id, { ops: [{ type: 'update', id: String(hello.id), props: { text: 'Public' } }] })
    assert.equal(operations.status, 403)
    assert.ok(!(await operations.text()).includes('live-only'))
    assert.notEqual(headingOf(session.layout()).props?.text, 'Public', 'not applied')
    // A new stream and MCP are refused too.
    assert.equal((await events.handler(await requestAs(editor, id))).status, 403)
    const server = payload.config.custom![BUILDER_CONFIG_KEY] as BuilderServerConfig
    const tools = builderMcpTools({ blocks: [...server.collections.pages.payloadBlocks!.blocks], collections: { pages: { field: 'layout' } } })
    const getLayout = tools.find((t) => t.name === 'getLayout')!
    const mcp = await getLayout.handler({ collection: 'pages', id: String(id) }, await requestAs(editor), {})
    assert.ok(!JSON.stringify(mcp).includes('live-only'))
    assert.equal((mcp as { isError?: boolean }).isError, true)
    // People who may read it keep working.
    const allowed = await callLive('operations', admin, id, { ops: [{ type: 'update', id: String(hello.id), props: { text: 'Public' } }] })
    assert.equal(allowed.status, 200)
  })

  it("takes what Payload's hooks did to the blocks themselves, and a later edit keeps it", async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    // The layout field's hook adds a generated block once, when a heading asks for it.
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'ADD GENERATED' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    await settle()
    const stored = rows(await read(id))
    assert.equal(stored.length, 3, 'the hook added a block')
    assert.equal(stored[2].note, 'generated')
    const shown = session.layout()
    assert.deepEqual(
      shown.blocks.map((b) => b.id),
      stored.map((r) => r.id),
      'the session holds the stored blocks, in order',
    )
    assert.ok(
      session.events.some((e) => e.type === 'session'),
      'editors get the stored state',
    )
    // A later canvas edit keeps the generated block.
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Later' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    const later = rows(await read(id))
    assert.equal(later.length, 3)
    assert.equal(later[2].note, 'generated')
    assert.equal(((later[0].content as Row[])[0] as Row).text, 'Later')
  })

  it('keeps a canvas edit made while the save ran on top of what the hooks stored', async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const [intro, bottom] = session.layout().blocks
    const hello = intro.slots!.content[0]
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'ADD GENERATED' } }])).ok, true)
    const flushed = session.flush()
    // An edit while the save runs.
    assert.equal((await session.commit([{ type: 'update', id: bottom.id, props: { text: 'During the save' } }])).ok, true)
    assert.deepEqual(await flushed, { ok: true })
    await settle()
    const shown = session.layout()
    assert.equal(shown.blocks.length, 3, 'the generated block')
    assert.equal(shown.blocks[1].props?.text, 'During the save', 'the edit made meanwhile')
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = rows(await read(id))
    assert.equal(stored.length, 3)
    assert.equal(stored[1].text, 'During the save')
  })
})

/** The JSON data of each SSE frame of `type`. */
const framesOf = (frames: string[], type: string) =>
  frames.filter((f) => f.includes(`event: ${type}`)).map((f) => JSON.parse(f.split('\n').find((l) => l.startsWith('data: '))!.slice(6)) as Record<string, unknown>)

/** The live event stream endpoint. */
const eventsEndpoint = () => (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/events` && e.method === 'get')!

describe('Payload blocks field: r3 review regressions (event stream)', () => {
  it('checks each queued event as it was, so a value added and removed again never goes out', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const hello = String((await storedHeading(id)).id)
    const session = openSession(id, admin)
    await session.connect()
    const stream = await eventsEndpoint().handler(await requestAs(editor, id))
    assert.equal(stream.status, 200)
    const frames = readFrames(stream, (all) => all.some((f) => f.includes('event: error')))
    await settle()
    // The editor's check of the next events waits…
    let release!: () => void
    holdTextRead = new Promise<void>((resolve) => (release = resolve))
    try {
      // …while an admin edits, adds a secret and removes it again.
      assert.equal((await session.commit([{ type: 'update', id: hello, props: { text: 'Benign' } }])).ok, true)
      assert.equal((await session.commit([{ type: 'update', id: hello, props: { secret: 'queued-secret' } }])).ok, true)
      assert.equal((await session.commit([{ type: 'update', id: hello, unsetProps: ['secret'] }])).ok, true)
      assert.equal(headingOf(session.layout()).props?.secret, undefined, 'gone from the current layout')
    } finally {
      holdTextRead = null
      release()
    }
    const sent = await frames
    assert.ok(!sent.some((f) => f.includes('queued-secret')), 'the old value never went out')
    assert.ok(sent.some((f) => f.includes('event: error')), 'the stream ended')
    assert.deepEqual(
      framesOf(sent, 'commit').map((c) => (c.ops as { props?: Record<string, unknown> }[])[0]?.props),
      [{ text: 'Benign' }],
      'only the benign commit went out',
    )
  })

  it('a check that holds a commit with a value inserted and removed in one batch refuses it too', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const intro = rows(await read(id))[0]
    const session = openSession(id, admin)
    await session.connect()
    const stream = await eventsEndpoint().handler(await requestAs(editor, id))
    const frames = readFrames(stream, (all) => all.some((f) => f.includes('event: error')))
    await settle()
    const ops = [
      { type: 'insert', block: { id: 'batch-secret', type: 'heading', props: { text: 'x', secret: 'batch-secret-value' } }, to: { parentId: String(intro.id), slot: 'content', index: 0 } },
      { type: 'remove', id: 'batch-secret' },
    ]
    assert.equal((await session.commit(ops)).ok, true)
    const sent = await frames
    assert.ok(!sent.some((f) => f.includes('batch-secret-value')))
    assert.ok(sent.some((f) => f.includes('event: error')))
  })

  it('never replays old commits to a reconnect: it gets the current state', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const hello = String((await storedHeading(id)).id)
    const session = openSession(id, admin)
    await session.connect()
    // The editor connects and remembers where it was.
    const first = await eventsEndpoint().handler(await requestAs(editor, id))
    const opened = framesOf(await readFrames(first, (all) => all.some((f) => f.includes('event: session'))), 'session')[0]
    const resume = { seq: Number(opened.seq), session: String(opened.sessionId) }
    // While it is away, an admin adds a secret and removes it again.
    assert.equal((await session.commit([{ type: 'update', id: hello, props: { secret: 'old-secret' } }])).ok, true)
    assert.equal((await session.commit([{ type: 'update', id: hello, unsetProps: ['secret'] }])).ok, true)
    // It reconnects from the old seq.
    const req = await requestAs(editor, id)
    ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/pages/${id}/events?clientId=client-2-reconnect&seq=${resume.seq}&session=${resume.session}`
    const again = await eventsEndpoint().handler(req)
    assert.equal(again.status, 200)
    const sent = await readFrames(again, (all) => all.some((f) => f.includes('event: session') || f.includes('event: error')))
    assert.ok(!sent.some((f) => f.includes('old-secret')), 'no old commit with the value')
    assert.equal(framesOf(sent, 'commit').length, 0, 'no replay')
    assert.equal(framesOf(sent, 'session').length, 1, 'the current state')
  })
})

/** The blocks field's storage as the plugin set it up. */
const storageOf = () => (payload.config.custom![BUILDER_CONFIG_KEY] as BuilderServerConfig).collections.pages.payloadBlocks as PayloadBlocksStorage

/** Every `id` of an object at any depth of `value`. */
function allIds(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allIds(v, into))
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.id === 'string') into.push(o.id)
    Object.values(o).forEach((v) => allIds(v, into))
  }
  return into
}
const repeated = (ids: string[]) => ids.filter((x, i) => ids.indexOf(x) !== i)

describe('Payload blocks field: copies, clears and undo', () => {
  it('gives the rows of a duplicated block new ids, also nested deeper, and keeps the original rows', async () => {
    const id = await createPage()
    const original = rows(await read(id))
    const originalItems = ((original[0].content as Row[])[1].items as Row[]).map((r) => r.id)
    const session = openSession(id, admin)
    await session.connect()
    const intro = session.layout().blocks[0]
    assert.equal((await session.commit([{ type: 'duplicate', id: intro.id, newId: 'intro-copy' }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = rows(await read(id))
    assert.deepEqual(repeated(allIds(stored)), [], 'every id once')
    assert.deepEqual(((stored[0].content as Row[])[1].items as Row[]).map((r) => r.id), originalItems, 'the original keeps its rows')
    const copy = stored.find((r) => r.id === 'intro-copy')!
    const copyItems = (copy.content as Row[])[1].items as Row[]
    assert.deepEqual(copyItems.map((r) => r.caption), ['First', null], 'the copy keeps the values')
    // The editors hold the same ids as the database.
    assert.deepEqual(allIds(encodePayloadBlocks(session.layout(), storageOf())), allIds(stored))
  })

  it('gives a pasted block new row ids, and an undone removal its own rows back', async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const photos = session.layout().blocks[0].slots!.content[1]
    const intro = session.layout().blocks[0]
    // A paste: the block with new block ids and the rows it was copied with.
    const pasted = { ...structuredClone(photos), id: 'pasted' }
    assert.equal((await session.commit([{ type: 'insert', block: pasted, to: { parentId: intro.id, slot: 'content', index: 2 } }])).ok, true)
    const shown = session.layout().blocks[0].slots!.content
    assert.notDeepEqual(
      (shown[2].props!.items as Row[]).map((r) => r.id),
      (shown[1].props!.items as Row[]).map((r) => r.id),
    )
    // Remove the original, then undo (insert it back as it was).
    assert.equal((await session.commit([{ type: 'remove', id: photos.id }])).ok, true)
    assert.equal((await session.commit([{ type: 'insert', block: photos, to: { parentId: intro.id, slot: 'content', index: 1 } }])).ok, true)
    const back = session.layout().blocks[0].slots!.content[1]
    assert.deepEqual(back.props?.items, photos.props?.items, 'its own row ids')
    assert.deepEqual(await session.flush(), { ok: true })
    assert.deepEqual(repeated(allIds(rows(await read(id)))), [])
  })

  it('clears a prop, a block name and a value inside an array row in Payload too', async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const intro = session.layout().blocks[0]
    const [hello, photos] = intro.slots!.content
    const items = structuredClone(photos.props?.items as Row[])
    delete items[0].caption
    assert.equal(
      (
        await session.commit([
          { type: 'update', id: hello.id, unsetProps: ['note'] },
          { type: 'update', id: intro.id, label: null },
          { type: 'update', id: photos.id, props: { items } },
        ])
      ).ok,
      true,
    )
    assert.deepEqual(await session.flush(), { ok: true })
    await settle()
    const stored = rows(await read(id))
    const content = stored[0].content as Row[]
    assert.equal(content[0].note ?? null, null, 'the cleared prop')
    assert.equal(stored[0].blockName ?? null, null, 'the cleared name')
    assert.equal((content[1].items as Row[])[0].caption ?? null, null, 'the cleared value in the row')
    assert.equal((content[1].items as Row[])[0].image, mediaId, 'the rest of the row stays')
    assert.equal(content[0].text, 'Hello', 'other props stay')
    assert.equal(content[0].secret, 's3cret')
    // The session shows what is stored: the values stay cleared.
    const now = session.layout().blocks[0]
    assert.equal(now.label, undefined)
    assert.equal(now.slots!.content[0].props?.note ?? null, null)
  })
})

/** The autosave request Payload's form `submit` sends: multipart, the values as `_payload`. */
async function drawerAutosave(id: number, token: string, data: Record<string, unknown>): Promise<Response> {
  const body = new FormData()
  body.set('_payload', JSON.stringify({ ...data, _status: 'draft' }))
  return handleEndpoints({
    config: payload.config,
    request: new Request(`http://localhost${autosaveAction({ api: '/api', collection: 'pages', id, locale: 'en' })}`, {
      method: 'PATCH',
      body,
      headers: { Authorization: `JWT ${token}` },
    }),
  })
}

/** A signed-in admin's token: REST checks the session as Payload does. */
async function adminToken(name: string): Promise<string> {
  const email = `${name}@example.test`
  await payload.create({ collection: 'users', data: { email, password: 'drawer-pass-1', role: 'admin' } as never, overrideAccess: true })
  return (await payload.login({ collection: 'users', data: { email, password: 'drawer-pass-1' } })).token as string
}

describe("Payload blocks field: the settings drawer's save before it closes", () => {
  it('saves a pending edit (any script, any size) as a draft and keeps the canvas edit', { timeout: 10_000 }, async () => {
    const id = await createPage()
    const token = await adminToken(`drawer-${id}`)
    // The drawer's form loads the page, the canvas edits and saves meanwhile…
    const form = await read(id)
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Canvas edit' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    // …the user typed a long multilingual title and closes: the form saves it first.
    const typed = `Ünïcödé 日本語 العربية 🎉 ${'😀'.repeat(20_000)}`
    assert.ok(new TextEncoder().encode(typed).byteLength > 64_000, 'larger than a keepalive request may be')
    const response = await drawerAutosave(id, token, { ...form, heroTitle: typed })
    assert.equal(response.status, 200, await response.clone().text())
    await settle()
    const doc = await read(id)
    assert.equal(doc.heroTitle, typed)
    assert.equal(doc._status, 'draft', 'never published')
    assert.equal(((rows(doc)[0].content as Row[])[0] as Row).text, 'Canvas edit', 'the blocks it left as loaded keep the canvas edit')
    assert.ok(session.events.some((e) => e.type === 'saved' && (e as { fields?: string[] }).fields?.includes('heroTitle')))
  })

  it('answers a refused save with an error, so the drawer stays open with the input', { timeout: 10_000 }, async () => {
    const id = await createPage()
    const token = await adminToken(`drawer-refused-${id}`)
    const form = await read(id)
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Canvas edit' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    // The form changed the blocks the canvas changed meanwhile: a conflict, not a save.
    const changed = structuredClone(form.layout) as Row[]
    changed[1].text = 'Changed in the old form'
    const response = await drawerAutosave(id, token, { ...form, heroTitle: 'Kept in the form', layout: changed })
    assert.equal(response.ok, false)
    assert.equal(response.status, 409)
    const doc = await read(id)
    assert.equal(doc.heroTitle, 'Welcome', 'nothing saved')
    assert.equal(((rows(doc)[0].content as Row[])[0] as Row).text, 'Canvas edit')
  })
})

describe('independent review: restore, revert and access', () => {
  it("Payload's own Restore brings the version's blocks to the field and to the open canvas, after its commit", { timeout: 10_000 }, async () => {
    const id = await createPage()
    const v1 = rows(await read(id))
    const changed = structuredClone(v1)
    changed[1].text = 'Bottom v2'
    await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { layout: changed } as never })
    const versions = (await payload.findVersions({ collection: 'pages', where: { parent: { equals: id } }, overrideAccess: true, limit: 50, sort: 'createdAt' })).docs
    const older = versions.find((v) => ((v.version as Record<string, unknown>).layout as Row[] | undefined)?.[1]?.text === 'Bottom')!
    const session = openSession(id, admin)
    await session.connect()
    assert.equal(session.layout().blocks[1].props?.text, 'Bottom v2')
    // Payload's Restore (the version's own updatedAt in the data: not a stale form).
    await payload.restoreVersion({ collection: 'pages', id: older.id, overrideAccess: true, draft: true } as never)
    await settle()
    assert.equal(rows(await read(id))[1].text, 'Bottom', 'the version is stored')
    assert.equal(session.layout().blocks[1].props?.text, 'Bottom', 'the canvas shows it')
    // The next canvas save builds on the restored blocks.
    assert.equal((await session.commit([{ type: 'update', id: headingOf(session.layout()).id, props: { text: 'After restore' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = rows(await read(id))
    assert.equal(stored[1].text, 'Bottom')
    assert.equal(((stored[0].content as Row[])[0] as Row).text, 'After restore')
  })

  it('refuses Revert to a user who may not read every value, and an allowed Revert keeps hidden values', { timeout: 10_000 }, async () => {
    const id = await createPage()
    await runPublishAction(await requestAs(admin), { target: openSession(id, admin).target, action: 'publish', runtime: liveRuntimeOf(payload) })
    const session = openSession(id, admin)
    await session.connect()
    const hello = headingOf(session.layout())
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { text: 'Draft only' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    // The editor may not read `secret`: a Revert would save the blocks without it.
    const refused = await runPublishAction(await requestAs(editor), { target: session.target, action: 'revert', runtime: liveRuntimeOf(payload) })
    assert.equal(refused.ok, false)
    assert.equal((refused as { status: number }).status, 403)
    assert.equal((await storedHeading(id)).text, 'Draft only', 'nothing reverted')
    // An admin reverts; the next canvas save keeps the secret (no null for a value it never showed).
    const reverted = await runPublishAction(await requestAs(admin), { target: session.target, action: 'revert', runtime: liveRuntimeOf(payload) })
    assert.equal(reverted.ok, true, JSON.stringify(reverted))
    assert.equal((await session.commit([{ type: 'update', id: hello.id, props: { level: 'h3' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = await storedHeading(id)
    assert.equal(stored.text, 'Hello')
    assert.equal(stored.secret, 's3cret')
  })

  it('never gives the live draft to a user who may read only the published version', { timeout: 10_000 }, async () => {
    // The builder's own JSON layout (blocks fields add their own read check on top).
    const post = await payload.create({ collection: 'posts', draft: false, overrideAccess: true, data: { title: 'P', _status: 'published', layout: { version: 1, blocks: [] } } as never })
    const id = post.id as number
    const server = payload.config.custom?.[BUILDER_CONFIG_KEY] as BuilderServerConfig
    const target = sessionTargetOf(payload, server.collections as never, 'posts', String(id))!
    const runtime = liveRuntimeOf(payload)
    const store = payload as unknown as LiveDocStore
    await runtime.sessions.connect({ target, store, clientId: `draft-${id}`, user: admin, send: () => {} })
    const block = { id: 'h1', type: 'heading', props: { text: 'Unpublished draft' } }
    const actor = { type: 'user' as const, id: 'users:1', label: 'Admin' }
    assert.equal((await runtime.sessions.commit({ target, store, user: admin, actor, ops: [{ type: 'insert', block, to: { parentId: null, index: 0 } }], blocks: [...storageOf().blocks] })).ok, true)
    assert.deepEqual(await runtime.sessions.flush('posts', id), { ok: true })
    const asViewer = async () => {
      const req = await requestAs(viewer, id)
      req.routeParams = { collection: 'posts', id: String(id) }
      ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/posts/${id}/events?clientId=viewer-${id}`
      return req
    }
    // Payload 4 refuses the unreadable latest draft before the builder opens.
    const events = await eventsEndpoint().handler(await asViewer())
    assert.equal(events.status, 404)
    const operations = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/operations` && e.method === 'post')!
    const opReq = await asViewer()
    opReq.data = { ops: [{ type: 'update', id: 'h1', props: { level: 'h3' } }] }
    const response = await operations.handler(opReq)
    assert.equal(response.status, 403)
    assert.ok(!(await response.text()).includes('Unpublished draft'))
    const tools = builderMcpTools({ blocks: [...storageOf().blocks], collections: { posts: { field: 'layout' } } })
    const mcp = await tools.find((t) => t.name === 'getLayout')!.handler({ collection: 'posts', id: String(id) }, await requestAs(viewer), {})
    assert.ok(!JSON.stringify(mcp).includes('Unpublished draft'))
  })
})

describe('independent review: event stream and operations', () => {
  it('an edit of a block inside a section does not end the stream', { timeout: 10_000 }, async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    const stream = await eventsEndpoint().handler(await requestAs(admin, id))
    const frames = readFrames(stream, (all) => all.some((f) => f.includes('event: commit') || f.includes('event: error')))
    await settle()
    // A gallery may only be inside a section.
    const photos = session.layout().blocks[0].slots!.content[1]
    assert.equal((await session.commit([{ type: 'update', id: photos.id, props: { settings: { columns: 2, tagline: 'Nested edit' } } }])).ok, true)
    const sent = await frames
    assert.ok(!sent.some((f) => f.includes('event: error')), 'no error')
    assert.ok(sent.some((f) => f.includes('Nested edit')), 'the commit went out')
  })

  it('checks each state of a batch with its siblings: a value hidden by a flag set in the same batch never goes out', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const hello = String((await storedHeading(id)).id)
    const session = openSession(id, admin)
    await session.connect()
    const stream = await eventsEndpoint().handler(await requestAs(editor, id))
    const frames = readFrames(stream, (all) => all.some((f) => f.includes('event: error')))
    await settle()
    const batch = [
      { type: 'update', id: hello, props: { private: true } },
      { type: 'update', id: hello, props: { confidential: 'SENSITIVE' } },
      { type: 'update', id: hello, unsetProps: ['confidential'] },
      { type: 'update', id: hello, props: { private: false } },
    ]
    assert.equal((await session.commit(batch)).ok, true)
    const sent = await frames
    assert.ok(!sent.some((f) => f.includes('SENSITIVE')))
    assert.ok(sent.some((f) => f.includes('event: error')))
    // The same batch through the operations endpoint, by the editor: refused before it changes anything.
    const id2 = await createPage({ secret: false })
    const hello2 = String((await storedHeading(id2)).id)
    const editorBatch = batch.map((op) => ({ ...op, id: hello2 }))
    const response = await callLive('operations', editor, id2, { ops: editorBatch })
    assert.equal(response.status, 403)
    assert.ok(!(await response.text()).includes('SENSITIVE'))
    assert.equal(liveRuntimeOf(payload).sessions.peek('pages', id2)?.layout.blocks[0].slots!.content[0].props?.private, undefined, 'not applied')
  })
})

describe('independent review: row ids across pages', () => {
  it("gives rows pasted from another page new ids, and keeps a page's own rows through remove, save and undo", { timeout: 10_000 }, async () => {
    const pageA = await createPage()
    const pageB = await createPage()
    const fromA = ((rows(await read(pageA))[0].content as Row[])[1].items as Row[]).map((r) => r.id)
    const a = openSession(pageA, admin)
    await a.connect()
    const copied = structuredClone(a.layout().blocks[0].slots!.content[1])
    const b = openSession(pageB, admin)
    await b.connect()
    const introB = b.layout().blocks[0]
    assert.equal((await b.commit([{ type: 'insert', block: { ...copied, id: 'pasted-from-a' }, to: { parentId: introB.id, slot: 'content', index: 0 } }])).ok, true)
    assert.deepEqual(await b.flush(), { ok: true })
    const pasted = ((rows(await read(pageB))[0].content as Row[]).find((r) => r.id === 'pasted-from-a')!.items as Row[]).map((r) => r.id)
    for (const rowId of pasted) assert.ok(!fromA.includes(rowId), 'no row id of page A on page B')
    // Page B's own gallery: remove, save, undo (insert it back as it was), save.
    const own = structuredClone(b.layout().blocks[0].slots!.content.find((x) => x.type === 'gallery' && x.id !== 'pasted-from-a')!)
    const ownRows = (own.props!.items as Row[]).map((r) => r.id)
    assert.equal((await b.commit([{ type: 'remove', id: own.id }])).ok, true)
    assert.deepEqual(await b.flush(), { ok: true })
    assert.equal((await b.commit([{ type: 'insert', block: own, to: { parentId: introB.id, slot: 'content', index: 1 } }])).ok, true)
    assert.deepEqual(await b.flush(), { ok: true })
    const back = ((rows(await read(pageB))[0].content as Row[]).find((r) => r.id === own.id)!.items as Row[]).map((r) => r.id)
    assert.deepEqual(back, ownRows, 'its own row ids')
  })
})

describe('independent review: saves and publishing', () => {
  it('publishes nothing when the session draft cannot be saved', { timeout: 10_000 }, async () => {
    const id = await createPage()
    const session = openSession(id, admin)
    await session.connect()
    assert.equal((await session.commit([{ type: 'update', id: headingOf(session.layout()).id, props: { text: 'Not saved' } }])).ok, true)
    failSessionSaves = true
    try {
      const result = await runPublishAction(await requestAs(admin), { target: session.target, action: 'publish', runtime: liveRuntimeOf(payload) })
      assert.equal(result.ok, false)
      assert.equal((await payload.findByID({ collection: 'pages', id, draft: false, overrideAccess: true }))._status, 'draft', 'not published')
    } finally {
      failSessionSaves = false
    }
  })

  it('a session save that waited behind a publish of the same layout writes no second draft', { timeout: 10_000 }, async () => {
    const post = await payload.create({ collection: 'posts', draft: true, overrideAccess: true, data: { title: 'P', layout: { version: 1, blocks: [] } } as never })
    const id = post.id as number
    const server = payload.config.custom?.[BUILDER_CONFIG_KEY] as BuilderServerConfig
    const target = sessionTargetOf(payload, server.collections as never, 'posts', String(id))!
    const runtime = liveRuntimeOf(payload)
    await runtime.sessions.connect({ target, store: payload as unknown as LiveDocStore, clientId: `post-${id}`, user: admin, send: () => {} })
    const block = { id: 'h1', type: 'heading', props: { text: 'Hello' } }
    assert.equal((await runtime.sessions.commit({ target, store: payload as unknown as LiveDocStore, user: admin, actor: { type: 'user', id: 'users:1', label: 'Admin' }, ops: [{ type: 'insert', block, to: { parentId: null, index: 0 } }], blocks: [...storageOf().blocks] })).ok, true)
    let entered!: () => void
    let release!: () => void
    const inside = new Promise<void>((resolve) => (entered = resolve))
    const wait = new Promise<void>((resolve) => (release = resolve))
    // Publish holds the gate; the session's save waits for it.
    const publish = payload.update({ collection: 'posts', id, draft: false, user: admin, overrideAccess: false, data: { _status: 'published' } as never, context: { hold: { entered, wait } } })
    await inside
    const flushed = runtime.sessions.flush('posts', id)
    release()
    await publish
    assert.deepEqual(await flushed, { ok: true })
    await settle()
    const all = (await payload.findVersions({ collection: 'posts', where: { parent: { equals: id } }, overrideAccess: true, limit: 50, sort: '-updatedAt' })).docs
    assert.equal((all[0].version as Record<string, unknown>)._status, 'published', 'the newest version is the publish, no draft after it')
  })
})

describe('independent review: region values in their own locale', () => {
  it("tells each region field's own value from the fallback", { timeout: 10_000 }, async () => {
    const id = await createPage()
    await payload.update({ collection: 'pages', id, draft: true, locale: 'fr', overrideAccess: true, data: { heroTitle: null } as never })
    const regions = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/regions` && e.method === 'get')!
    const req = await requestAs(admin, id)
    ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/pages/${id}/regions?locale=fr`
    const body = (await (await regions.handler(req)).json()) as { values: Record<string, unknown>; storedValues: Record<string, unknown> }
    assert.equal(body.values.heroTitle, 'Welcome', 'the page shows the fallback')
    assert.equal(body.storedValues.heroTitle, null, 'the locale has no own value')
    const en = await requestAs(admin, id)
    ;(en as { url?: string }).url = `http://localhost/api${LIVE_PATH}/pages/${id}/regions?locale=en`
    const own = (await (await regions.handler(en)).json()) as { values: Record<string, unknown>; storedValues: Record<string, unknown> }
    assert.equal(own.storedValues.heroTitle, 'Welcome')
  })
})

/** A live request as `user` for `collection`/`id`, with `query` on the URL. */
async function liveRequest(user: unknown, collection: string, id: number, name: string, query = '') {
  const req = await requestAs(user)
  req.routeParams = { collection, id: String(id) }
  ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/${collection}/${id}/${name}${query}`
  return req
}

/** A POST live endpoint (`/builder/live/:collection/:id/<name>`) of any collection, as `user`. */
async function postLive(name: string, user: unknown, collection: string, id: number, body: Record<string, unknown> = {}): Promise<Response> {
  const endpoint = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/${name}` && e.method === 'post')
  assert.ok(endpoint, name)
  const req = await liveRequest(user, collection, id, name)
  req.data = body
  return endpoint.handler(req)
}

let streams = 0
/** Cancels the streams the tests below opened, also after a failed assertion. */
const openStreams: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cancel of openStreams.splice(0)) await cancel()
})

/**
 * Opens the event stream as `user`. `frames(...secrets)` reads it to its first error frame, the
 * first frame with one of `secrets` (a leak fails at once, not by a timeout) or its end.
 */
async function streamAs(user: unknown, collection: string, id: number) {
  const clientId = `s-${collection}-${id}-${(user as { id: number }).id}-${++streams}`
  const response = await eventsEndpoint().handler(await liveRequest(user, collection, id, 'events', `?clientId=${clientId}`))
  const reader = response.status === 200 ? response.body!.getReader() : null
  const close = async () => {
    await reader?.cancel().catch(() => undefined)
  }
  if (reader) openStreams.push(close)
  const frames = async (...secrets: string[]) => {
    if (!reader) return []
    const decoder = new TextDecoder()
    const all: string[] = []
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      all.push(...parts)
      if (all.some((f) => f.includes('event: error') || secrets.some((secret) => f.includes(secret)))) break
    }
    await close()
    return all
  }
  return { status: response.status, frames, close }
}

/** The text a refusal or a stream sent, for "never sent" checks. */
const sentText = (frames: string[]) => frames.join('\n')

const server = () => payload.config.custom?.[BUILDER_CONFIG_KEY] as BuilderServerConfig
const actorAdmin = { type: 'user' as const, id: 'users:1', label: 'Admin' }

/** A JSON-layout document with an open session (as `admin`), and a commit helper. Published with `publish`. */
async function jsonDoc(collection: 'posts' | 'notes', data: Record<string, unknown>, options: { publish?: boolean } = {}) {
  const created = await payload.create({
    collection,
    draft: !options.publish,
    overrideAccess: true,
    data: { ...data, ...(options.publish ? { _status: 'published' } : {}), layout: { version: 1, blocks: [] } } as never,
  })
  const id = created.id as number
  const target = sessionTargetOf(payload, server().collections as never, collection, String(id))!
  const runtime = liveRuntimeOf(payload)
  const store = payload as unknown as LiveDocStore
  await runtime.sessions.connect({ target, store, clientId: `admin-${collection}-${id}`, user: admin, send: () => {} })
  const insert = (text: string, blockId = `h-${text}`) =>
    runtime.sessions.commit({ target, store, user: admin, actor: actorAdmin, ops: [{ type: 'insert', block: { id: blockId, type: 'heading', props: { text } }, to: { parentId: null, index: 0 } }], blocks: [...storageOf().blocks] })
  const layout = () => runtime.sessions.peek(collection, id)?.layout as Layout
  return { id, insert, layout }
}

/** A published page (nothing secret stored) with an open session as `admin`. */
async function publishedPage() {
  const id = await createPage({ secret: false })
  await payload.update({ collection: 'pages', id, draft: false, overrideAccess: true, data: { _status: 'published' } as never })
  const session = openSession(id, admin)
  await session.connect()
  return { id, session }
}

const mcpTools = (collection: 'pages' | 'posts') => builderMcpTools({ blocks: [...storageOf().blocks], collections: { [collection]: { field: 'layout' } } })

const tenantA = { id: 21, collection: 'users', email: 'tenant-a@example.test', role: 'tenant', tenant: 'a' }
const tenantB = { id: 22, collection: 'users', email: 'tenant-b@example.test', role: 'tenant', tenant: 'b' }
const author = { id: 23, collection: 'users', email: 'author@example.test', role: 'author' }
const otherAuthor = { id: 24, collection: 'users', email: 'other@example.test', role: 'author' }

describe('live draft read access (second review)', () => {
  it('a published-only reader gets no stream of a JSON layout, also before anything is saved as a draft', { timeout: 10_000 }, async () => {
    const post = await jsonDoc('posts', { title: 'Published' }, { publish: true })
    // The newest stored version is the published one, and Payload gives the viewer that one.
    const asViewer = await payload.findByID({ collection: 'posts', id: post.id, draft: true, depth: 0, user: viewer, overrideAccess: false })
    assert.deepEqual((asViewer.layout as Layout).blocks, [])
    assert.equal((await streamAs(viewer, 'posts', post.id)).status, 403, 'nothing saved yet')
    // An unsaved edit: Payload's draft read still gives the viewer the published, empty layout.
    assert.equal((await post.insert('UNPUBLISHED_SECRET')).ok, true)
    const stream = await streamAs(viewer, 'posts', post.id)
    assert.equal(stream.status, 403)
    const again = await payload.findByID({ collection: 'posts', id: post.id, draft: true, depth: 0, user: viewer, overrideAccess: false })
    assert.ok(!JSON.stringify(again).includes('UNPUBLISHED_SECRET'), "Payload's own read hides it")
  })

  it('a published-only reader gets no stream of a Payload blocks field with an unsaved edit', { timeout: 10_000 }, async () => {
    const { id, session } = await publishedPage()
    assert.equal((await session.commit([{ type: 'update', id: headingOf(session.layout()).id, props: { text: 'UNPUBLISHED_BLOCK_SECRET' } }])).ok, true)
    const stream = await streamAs(viewer, 'pages', id)
    assert.equal(stream.status, 404)
    const operations = await postLive('operations', viewer, 'pages', id, { ops: [{ type: 'update', id: headingOf(session.layout()).id, props: { level: 'h3' } }] })
    assert.equal(operations.status, 403)
    assert.ok(!(await operations.text()).includes('UNPUBLISHED_BLOCK_SECRET'))
    assert.equal(headingOf(session.layout()).props?.level, 'h2', 'not applied')
    const mcpRead = await mcpTools('pages').find((t) => t.name === 'getLayout')!.handler({ collection: 'pages', id: String(id) }, await requestAs(viewer), {})
    assert.ok(!JSON.stringify(mcpRead).includes('UNPUBLISHED_BLOCK_SECRET'))
    assert.equal((mcpRead as { isError?: boolean }).isError, true)
  })

  it('ends an open JSON stream at the next event once the rule allows published versions only', { timeout: 10_000 }, async () => {
    const post = await jsonDoc('posts', { title: 'Published' }, { publish: true })
    viewerReadsDrafts = true
    try {
      const stream = await streamAs(viewer, 'posts', post.id)
      assert.equal(stream.status, 200)
      const frames = stream.frames('REVOKED_SECRET')
      await settle()
      viewerReadsDrafts = false
      assert.equal((await post.insert('REVOKED_SECRET')).ok, true)
      const sent = await frames
      assert.ok(!sentText(sent).includes('REVOKED_SECRET'), 'the pending draft never went out')
      assert.ok(sent.some((f) => f.includes('event: error')))
    } finally {
      viewerReadsDrafts = false
    }
  })

  it('ends an open blocks stream at the next event once the rule allows published versions only', { timeout: 10_000 }, async () => {
    const { id, session } = await publishedPage()
    viewerReadsDrafts = true
    try {
      const stream = await streamAs(viewer, 'pages', id)
      assert.equal(stream.status, 200)
      const frames = stream.frames('REVOKED_BLOCK_SECRET')
      await settle()
      viewerReadsDrafts = false
      assert.equal((await session.commit([{ type: 'update', id: headingOf(session.layout()).id, props: { text: 'REVOKED_BLOCK_SECRET' } }])).ok, true)
      const sent = await frames
      assert.ok(!sentText(sent).includes('REVOKED_BLOCK_SECRET'))
      assert.ok(sent.some((f) => f.includes('event: error')))
    } finally {
      viewerReadsDrafts = false
    }
  })

  it("a tenant rule: the newest draft's tenant decides, not an older version that matches", { timeout: 10_000 }, async () => {
    const note = await jsonDoc('notes', { title: 'N', tenant: 'a' }, { publish: true })
    const a = await streamAs(tenantA, 'notes', note.id)
    assert.equal(a.status, 200, 'tenant A matches')
    const frames = a.frames('TENANT_B_DRAFT')
    assert.notEqual((await streamAs(tenantB, 'notes', note.id)).status, 200, 'tenant B does not')
    // A native draft save moves the note to tenant B. Payload 4 refuses tenant A's draft read.
    await payload.update({ collection: 'notes', id: note.id, draft: true, user: admin, overrideAccess: false, data: { tenant: 'b' } as never })
    const main = await payload.findByID({ collection: 'notes', id: note.id, draft: false, overrideAccess: true })
    assert.equal(main.tenant, 'a', 'the published document keeps tenant A')
    await assert.rejects(payload.findByID({ collection: 'notes', id: note.id, draft: true, depth: 0, user: tenantA, overrideAccess: false }), { status: 404 })
    assert.equal((await streamAs(tenantA, 'notes', note.id)).status, 404, 'not from an older version that matches')
    assert.equal((await postLive('operations', tenantA, 'notes', note.id, { ops: [] })).status, 403)
    // Tenant A's open stream ends at its next event, before the draft goes out.
    assert.equal((await note.insert('TENANT_B_DRAFT')).ok, true)
    const sent = await frames
    assert.ok(!sentText(sent).includes('TENANT_B_DRAFT'))
    assert.ok(sent.some((f) => f.includes('event: error')))
    // Payload 4 permits tenant B to read the newest draft that now belongs to B.
    const b = await streamAs(tenantB, 'notes', note.id)
    assert.equal(b.status, 200)
    await b.close()
  })

  it('an "author or published" rule: the author may use the builder, another reader of the published version may not', { timeout: 10_000 }, async () => {
    const note = await jsonDoc('notes', { title: 'N', author: 'author@example.test' }, { publish: true })
    assert.equal((await note.insert('AUTHOR_DRAFT')).ok, true)
    const own = await streamAs(author, 'notes', note.id)
    assert.equal(own.status, 200)
    await own.close()
    const other = await streamAs(otherAuthor, 'notes', note.id)
    assert.equal(other.status, 403, 'published only for them')
    const operations = await postLive('operations', otherAuthor, 'notes', note.id, { ops: [{ type: 'remove', id: 'h-AUTHOR_DRAFT' }] })
    assert.equal(operations.status, 403)
    assert.ok(!(await operations.text()).includes('AUTHOR_DRAFT'))
    assert.ok(note.layout().blocks.some((b) => b.id === 'h-AUTHOR_DRAFT'), 'nothing removed')
    const allowed = await postLive('operations', author, 'notes', note.id, { ops: [{ type: 'update', id: 'h-AUTHOR_DRAFT', props: { level: 'h3' } }] })
    assert.equal(allowed.status, 200)
  })

  it('refuses operations, flush, validate and MCP to a published-only reader while a session is open, before anything changes', { timeout: 10_000 }, async () => {
    const post = await jsonDoc('posts', { title: 'Published' }, { publish: true })
    assert.equal((await post.insert('PENDING_TEXT')).ok, true)
    const operations = await postLive('operations', viewer, 'posts', post.id, { ops: [{ type: 'remove', id: 'h-PENDING_TEXT' }] })
    assert.equal(operations.status, 403)
    assert.ok(!(await operations.text()).includes('PENDING_TEXT'))
    const commit = await postLive('commit', viewer, 'posts', post.id, { clientId: 'viewer-1', batchId: 'b1', ops: [{ type: 'remove', id: 'h-PENDING_TEXT' }] })
    assert.equal(commit.status, 403)
    const flush = await postLive('flush', viewer, 'posts', post.id)
    assert.equal(flush.status, 403)
    assert.equal(liveRuntimeOf(payload).sessions.unsaved() > 0, true, 'the flush saved nothing')
    // `note` has its own validate function, so the endpoint runs (and reads) for headings.
    const validate = await postLive('validate', viewer, 'posts', post.id, { block: { id: 'h-PENDING_TEXT', type: 'heading', props: { text: 'x' } } })
    assert.equal(validate.status, 403)
    assert.ok(!(await validate.text()).includes('PENDING_TEXT'))
    const tools = mcpTools('posts')
    const mcpRead = await tools.find((t) => t.name === 'getLayout')!.handler({ collection: 'posts', id: String(post.id) }, await requestAs(viewer), {})
    assert.ok(!JSON.stringify(mcpRead).includes('PENDING_TEXT'))
    assert.equal((mcpRead as { isError?: boolean }).isError, true)
    const write = await tools.find((t) => t.name === 'applyOperations')!.handler(
      { collection: 'posts', id: String(post.id), operations: [{ type: 'remove', id: 'h-PENDING_TEXT' }] },
      await requestAs(viewer),
      {},
    )
    assert.equal((write as { isError?: boolean }).isError, true)
    assert.ok(!JSON.stringify(write).includes('PENDING_TEXT'))
    const validateTool = await tools.find((t) => t.name === 'validateLayout')!.handler({ collection: 'posts', id: String(post.id) }, await requestAs(viewer), {})
    assert.ok(!JSON.stringify(validateTool).includes('PENDING_TEXT'))
    assert.ok(post.layout().blocks.some((b) => b.id === 'h-PENDING_TEXT'), 'nothing removed')
  })

  it('people who may read drafts work as before, and get every pending edit', { timeout: 10_000 }, async () => {
    const post = await jsonDoc('posts', { title: 'Published' }, { publish: true })
    const stream = await streamAs(admin, 'posts', post.id)
    assert.equal(stream.status, 200)
    const frames = stream.frames('ADMIN_PENDING')
    await settle()
    assert.equal((await post.insert('ADMIN_PENDING')).ok, true)
    const sent = await frames
    assert.ok(!sent.some((f) => f.includes('event: error')))
    assert.ok(framesOf(sent, 'commit').some((c) => JSON.stringify(c).includes('ADMIN_PENDING')), 'the commit went out')
    // The operations endpoint and MCP, with the pending text in the answer.
    const operations = await postLive('operations', admin, 'posts', post.id, { ops: [{ type: 'update', id: 'h-ADMIN_PENDING', props: { level: 'h3' } }] })
    assert.equal(operations.status, 200)
    assert.ok((await operations.text()).includes('ADMIN_PENDING'))
    const mcpRead = await mcpTools('posts').find((t) => t.name === 'getLayout')!.handler({ collection: 'posts', id: String(post.id) }, await requestAs(admin), {})
    assert.ok(JSON.stringify(mcpRead).includes('ADMIN_PENDING'))
    assert.equal((await postLive('flush', admin, 'posts', post.id)).status, 200)
  })
})

describe('the document fields field access reads, after a save from outside (second review)', () => {
  it('a page made private in a save of another field hides its headings from the open stream at once', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const session = openSession(id, admin)
    await session.connect()
    const stream = await streamAs(editor, 'pages', id)
    assert.equal(stream.status, 200)
    const frames = stream.frames('NEW_PRIVATE_SECRET')
    await settle()
    // A save of another field (not the blocks): the page becomes private.
    await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { private: true } as never })
    assert.equal((await session.commit([{ type: 'update', id: headingOf(session.layout()).id, props: { text: 'NEW_PRIVATE_SECRET' } }])).ok, true)
    const sent = await frames
    assert.ok(!sentText(sent).includes('NEW_PRIVATE_SECRET'), 'never sent')
    assert.ok(sent.some((f) => f.includes('event: error')))
    // Payload's own read hides it from the editor too.
    const rest = await payload.findByID({ collection: 'pages', id, draft: true, depth: 0, user: editor, overrideAccess: false })
    assert.equal(((rest.layout as Row[])[0].content as Row[])[0].text, undefined)
    // The operations endpoint and MCP refuse before anything applies.
    const response = await callLive('operations', editor, id, { ops: [{ type: 'update', id: headingOf(session.layout()).id, props: { level: 'h3' } }] })
    assert.equal(response.status, 403)
    assert.ok(!(await response.text()).includes('NEW_PRIVATE_SECRET'))
    assert.equal(headingOf(session.layout()).props?.level, 'h2', 'not applied')
    const mcpRead = await mcpTools('pages').find((t) => t.name === 'getLayout')!.handler({ collection: 'pages', id: String(id) }, await requestAs(editor), {})
    assert.ok(!JSON.stringify(mcpRead).includes('NEW_PRIVATE_SECRET'))
  })

  it("an editor's own commit is checked against the fields as stored now, not as the session loaded them", { timeout: 10_000 }, async () => {
    // A page without any heading text: nothing the editor may not read is stored, now or later.
    const created = await payload.create({ collection: 'pages', draft: true, overrideAccess: true, data: { title: 'Plain', layout: [{ blockType: 'heading', level: 'h2' }] } as never })
    const id = created.id as number
    const session = openSession(id, admin)
    await session.connect()
    // The session read the page while it was public; then a save of another field makes it private.
    await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { private: true } as never })
    // The editor may not read heading text on a private page: a batch that adds some is refused before it applies.
    const response = await callLive('operations', editor, id, {
      ops: [{ type: 'insert', block: { id: 'editor-heading', type: 'heading', props: { text: 'EDITOR_PRIVATE' } }, to: { parentId: null, index: 0 } }],
    })
    assert.equal(response.status, 403)
    assert.ok(!session.layout().blocks.some((b) => b.id === 'editor-heading'), 'not applied')
    // The same batch on a public page goes through.
    await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { private: false } as never })
    const allowed = await callLive('operations', editor, id, {
      ops: [{ type: 'insert', block: { id: 'editor-heading', type: 'heading', props: { text: 'EDITOR_PUBLIC' } }, to: { parentId: null, index: 0 } }],
    })
    assert.equal(allowed.status, 200, await allowed.clone().text())
  })

  it('an event waiting in the queue is checked against the document as it is when its check ends', { timeout: 10_000 }, async () => {
    const id = await createPage({ secret: false })
    const session = openSession(id, admin)
    await session.connect()
    const stream = await streamAs(editor, 'pages', id)
    assert.equal(stream.status, 200)
    const frames = stream.frames('QUEUED_PRIVATE_SECRET')
    await settle()
    let release!: () => void
    holdTextRead = new Promise<void>((resolve) => (release = resolve))
    try {
      // The commit goes out while the page is public; its check waits inside the field's access.
      assert.equal((await session.commit([{ type: 'update', id: headingOf(session.layout()).id, props: { text: 'QUEUED_PRIVATE_SECRET' } }])).ok, true)
      await settle()
      // Meanwhile the page becomes private.
      await payload.update({ collection: 'pages', id, draft: true, user: admin, overrideAccess: false, data: { private: true } as never })
    } finally {
      holdTextRead = null
      release()
    }
    const sent = await frames
    assert.ok(!sentText(sent).includes('QUEUED_PRIVATE_SECRET'), 'checked again with the current document')
    assert.ok(sent.some((f) => f.includes('event: error')))
  })

  it('a JSON layout: a save of another field applies to the commit checks at once', { timeout: 10_000 }, async () => {
    const note = await jsonDoc('notes', { title: 'N', tenant: 'a' })
    const stream = await streamAs(tenantA, 'notes', note.id)
    assert.equal(stream.status, 200)
    const frames = stream.frames('MOVED_SECRET')
    await settle()
    // The settings drawer moves the draft to tenant B (the session's layout is not touched).
    await payload.update({ collection: 'notes', id: note.id, draft: true, user: admin, overrideAccess: false, data: { tenant: 'b' } as never })
    assert.equal((await note.insert('MOVED_SECRET')).ok, true)
    const sent = await frames
    assert.ok(!sentText(sent).includes('MOVED_SECRET'))
    assert.ok(sent.some((f) => f.includes('event: error')))
  })
})
