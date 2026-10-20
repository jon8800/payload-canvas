// Restores and nested saves through the real Payload Local API (memory database): the builder's
// Restore and the live session's other fields, a Restore that fails, and the "Default template"
// hook that saves another template with the same request.

import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { buildConfig, createPayloadRequest, getPayload, handleEndpoints, type Block, type CollectionConfig, type Payload, type PayloadRequest } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import type { Layout } from '../core/types'
import type { LiveDocStore } from '../live/apply'
import { builderConfigOf, restoreDocumentVersion, runPublishAction } from '../live/document'
import { LIVE_PATH, sessionTargetOf } from '../live/endpoints'
import { liveRuntimeOf } from '../live/runtime'
import type { LiveSessionEvent, MultiplayerEvent } from '../live/types'
import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

/** While set, a hook refuses every restore of a version. */
let failRestores = false
/** While set, a hook refuses every Revert (the plugin's save of the stored published layout). */
let failReverts = false
/** While set, the next save with this title waits in the first hook: it holds the write gate, before the session guard. */
let holdTitle: { title: string; started: () => void; until: Promise<void> } | null = null
const refuseRestores = async ({ context, data }: { context: Record<string, unknown>; data: unknown }) => {
  if (failRestores && context.isRestoringVersion) throw new Error('The restore was refused by a hook.')
  if (failReverts && context.builderStoredLayout && !context.isRestoringVersion) throw new Error('The revert was refused by a hook.')
  const held = holdTitle
  if (held && (data as { title?: unknown } | undefined)?.title === held.title) {
    holdTitle = null
    held.started()
    await held.until
  }
  return data
}

const heading: Block = {
  slug: 'heading',
  fields: [
    { name: 'text', type: 'text' },
    // Nobody changes the level of a locked document.
    { name: 'level', type: 'text', access: { update: ({ doc }) => !(doc as { locked?: boolean } | undefined)?.locked } },
  ],
}

const all = { read: () => true, create: () => true, update: () => true, delete: () => true }
/** The builder's own JSON layout. */
const posts: CollectionConfig = {
  slug: 'posts',
  versions: { drafts: true },
  access: all,
  hooks: { beforeChange: [refuseRestores as never] },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'locked', type: 'checkbox' },
  ],
}
/** The collection's own Payload blocks field. */
const articles: CollectionConfig = {
  slug: 'articles',
  versions: { drafts: true },
  access: all,
  hooks: { beforeChange: [refuseRestores as never] },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'layout', type: 'blocks', blocks: [heading] },
  ],
}
/** The target of templates. */
const pages: CollectionConfig = { slug: 'pages', versions: { drafts: true }, access: all, fields: [{ name: 'title', type: 'text' }] }

const admin = { id: 1, collection: 'users', email: 'admin@example.test' }
const actor = { type: 'user' as const, id: 'users:1', label: 'Admin' }
const TEMPLATES = 'builder-templates'

let payload: Payload

before(async () => {
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [{ slug: 'users', auth: true, fields: [] }, posts, articles, pages],
    plugins: [
      websiteBuilder({
        collections: { posts: {}, articles: {}, pages: { templates: true } },
        blocks: fromPayloadBlocks([heading], { onWarning: false }),
        css: { entry: 'globals.css' },
        theme: false,
      }),
    ],
  })
  payload = await getPayload({ config })
})

const runtime = () => liveRuntimeOf(payload)
const store = () => payload as unknown as LiveDocStore
const blocks = () => [...(builderConfigOf(payload)!.collections.articles.payloadBlocks?.blocks ?? [])]

/** An open session of `collection`/`id` as the admin, with helpers. */
async function openSession(collection: string, id: number | string) {
  const target = sessionTargetOf(payload, builderConfigOf(payload)!.collections, collection, String(id))!
  const events: MultiplayerEvent[] = []
  await runtime().sessions.connect({ target, store: store(), clientId: `c-${collection}-${id}`, user: admin, send: (event) => events.push(event) })
  return {
    target,
    /** Saved or not, as the newest `session` event (a reset sends one) told the editors. */
    saved: () => {
      const last = events.filter((e): e is LiveSessionEvent => e.type === 'session').at(-1)
      assert.ok(last, 'a session event')
      return last.savedSeq === last.seq
    },
    commit: (ops: unknown[]) => runtime().sessions.commit({ target, store: store(), user: admin, actor, ops, blocks: blocks() }),
    flush: () => runtime().sessions.flush(collection, id),
    layout: () => runtime().sessions.peek(collection, id)?.layout as Layout,
  }
}

const textOf = (layout: Layout | undefined) => layout?.blocks[0]?.props?.text
const asAdmin = async () => (await createPayloadRequest({ user: admin as never, payload })) as PayloadRequest

/** The newest version of `collection`/`id` whose stored values match `pick`. */
async function versionWhere(collection: string, id: number | string, pick: (version: Record<string, unknown>) => boolean) {
  const { docs } = await payload.findVersions({ collection: collection as never, where: { parent: { equals: id } }, overrideAccess: true, limit: 100, sort: '-updatedAt', depth: 0 })
  const found = docs.find((v) => pick(v.version as Record<string, unknown>))
  assert.ok(found, 'the version exists')
  return String(found.id)
}

/** The operations endpoint of the live channel, as the admin. */
async function operations(collection: string, id: number | string, ops: unknown[]) {
  const endpoint = (payload.config.endpoints ?? []).find((e) => e.path === `${LIVE_PATH}/:collection/:id/operations` && e.method === 'post')!
  const req = await asAdmin()
  req.routeParams = { collection, id: String(id) }
  ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/${collection}/${id}/operations`
  req.data = { ops }
  return endpoint.handler(req)
}

const jsonLayout = (text: string): Layout => ({ version: 1, blocks: [{ id: 'h1', type: 'heading', props: { text } }] })

describe("the builder's Restore and the session's other fields", () => {
  it("brings the version's other fields to the session's checks, after its commit, and keeps the restored layout", { timeout: 10_000 }, async () => {
    const post = await payload.create({ collection: 'posts', draft: true, overrideAccess: true, data: { title: 'P', locked: true, layout: jsonLayout('v1') } as never })
    const id = post.id as number
    await payload.update({ collection: 'posts', id, draft: true, overrideAccess: true, data: { locked: false, layout: jsonLayout('v2') } as never })
    const lockedVersion = await versionWhere('posts', id, (v) => v.locked === true)
    const session = await openSession('posts', id)
    assert.equal((await runtime().sessions.currentDoc('posts', id))?.locked, false)
    const restored = await restoreDocumentVersion(await asAdmin(), { target: session.target, versionId: lockedVersion, runtime: runtime() })
    assert.equal(restored.ok, true, JSON.stringify(restored))
    assert.equal(textOf(session.layout()), 'v1', "the session shows the version's layout")
    assert.equal((await runtime().sessions.currentDoc('posts', id))?.locked, true, "the session reads the version's fields")
    // A change the restored fields forbid is refused before it applies.
    const refused = await operations('posts', id, [{ type: 'update', id: 'h1', props: { level: 'h3' } }])
    assert.equal(refused.status, 403, await refused.clone().text())
    assert.equal(session.layout().blocks[0].props?.level, undefined, 'not applied')
    assert.equal(textOf(session.layout()), 'v1')
  })
})

describe('a builder Restore that fails', () => {
  it('gives a JSON layout session back its unsaved edits, and the next save stores them', { timeout: 10_000 }, async () => {
    const post = await payload.create({ collection: 'posts', draft: true, overrideAccess: true, data: { title: 'P', layout: jsonLayout('v1') } as never })
    const id = post.id as number
    const session = await openSession('posts', id)
    assert.equal((await session.commit([{ type: 'update', id: 'h1', props: { text: 'v2' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    assert.equal((await session.commit([{ type: 'update', id: 'h1', props: { text: 'PENDING' } }])).ok, true)
    const v1 = await versionWhere('posts', id, (v) => textOf(v.layout as Layout) === 'v1')
    failRestores = true
    try {
      const result = await restoreDocumentVersion(await asAdmin(), { target: session.target, versionId: v1, runtime: runtime() })
      assert.equal(result.ok, false)
    } finally {
      failRestores = false
    }
    assert.equal(textOf(session.layout()), 'PENDING', 'the unsaved edit is back')
    assert.ok(runtime().sessions.unsaved() > 0, 'still unsaved')
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = await payload.findByID({ collection: 'posts', id, draft: true, overrideAccess: true, depth: 0 })
    assert.equal(textOf(stored.layout as Layout), 'PENDING', 'the next save stores it')
  })

  it('gives a Payload blocks session back its unsaved edits and its stored value, and the next save stores them', { timeout: 10_000 }, async () => {
    const article = await payload.create({ collection: 'articles', draft: true, overrideAccess: true, data: { title: 'A', layout: [{ blockType: 'heading', text: 'v1', level: 'h2' }] } as never })
    const id = article.id as number
    const session = await openSession('articles', id)
    const row = session.layout().blocks[0].id
    assert.equal((await session.commit([{ type: 'update', id: row, props: { text: 'v2' } }])).ok, true)
    assert.deepEqual(await session.flush(), { ok: true })
    assert.equal((await session.commit([{ type: 'update', id: row, props: { text: 'PENDING' } }])).ok, true)
    const v1 = await versionWhere('articles', id, (v) => (v.layout as { text?: string }[] | undefined)?.[0]?.text === 'v1')
    failRestores = true
    try {
      const result = await restoreDocumentVersion(await asAdmin(), { target: session.target, versionId: v1, runtime: runtime() })
      assert.equal(result.ok, false)
    } finally {
      failRestores = false
    }
    assert.equal(textOf(session.layout()), 'PENDING')
    assert.deepEqual(await session.flush(), { ok: true })
    const stored = (await payload.findByID({ collection: 'articles', id, draft: true, overrideAccess: true, depth: 0 })) as unknown as { layout: { id: string; text: string; level: string }[] }
    assert.equal(stored.layout.length, 1)
    assert.equal(stored.layout[0].id, row, 'the same row')
    assert.equal(stored.layout[0].text, 'PENDING')
    assert.equal(stored.layout[0].level, 'h2', 'the other values stay')
  })
})

describe('the "Default template" hook saves another template with the same request', () => {
  it("never marks the other template's unsaved edit as saved with this template's seq", { timeout: 10_000 }, async () => {
    const layout = jsonLayout('start')
    const b = await payload.create({ collection: TEMPLATES as never, overrideAccess: true, data: { name: 'B', targetCollection: 'pages', isDefault: true, layout, _status: 'published' } as never })
    const a = await payload.create({ collection: TEMPLATES as never, overrideAccess: true, draft: true, data: { name: 'A', targetCollection: 'pages', isDefault: true, layout } as never })
    const templateA = await openSession(TEMPLATES, a.id)
    const templateB = await openSession(TEMPLATES, b.id)
    // A's seq runs ahead of B's.
    for (let i = 0; i < 5; i++) assert.equal((await templateA.commit([{ type: 'update', id: 'h1', props: { text: `a${i}` } }])).ok, true)
    assert.deepEqual(await templateA.flush(), { ok: true })
    // B: one unsaved edit; then A is published as the default before B's save runs.
    assert.equal((await templateB.commit([{ type: 'update', id: 'h1', props: { text: 'B edited' } }])).ok, true)
    const published = await runPublishAction(await asAdmin(), { target: templateA.target, action: 'publish', runtime: runtime() })
    assert.equal(published.ok, true, JSON.stringify(published))
    const bPublished = await payload.findByID({ collection: TEMPLATES as never, id: b.id, draft: false, overrideAccess: true, depth: 0 })
    assert.equal((bPublished as { isDefault?: boolean }).isDefault, false, 'B is no longer the default')
    assert.equal(textOf(templateB.layout()), 'B edited')
    assert.ok(runtime().sessions.unsaved() > 0, "B's edit is still unsaved")
    assert.deepEqual(await templateB.flush(), { ok: true })
    const bDraft = await payload.findByID({ collection: TEMPLATES as never, id: b.id, draft: true, overrideAccess: true, depth: 0 })
    assert.equal(textOf((bDraft as { layout?: Layout }).layout), 'B edited', "B's edit is stored")
  })
})

/** The two storages: the builder's JSON layout (posts) and a Payload blocks field (articles). */
const kinds = {
  posts: {
    data: (text: string) => ({ title: 'P', layout: jsonLayout(text) }),
    storedText: (doc: Record<string, unknown>) => textOf(doc.layout as Layout | undefined),
  },
  articles: {
    data: (text: string) => ({ title: 'A', layout: [{ blockType: 'heading', text, level: 'h2' }] }),
    storedText: (doc: Record<string, unknown>) => (doc.layout as { text?: string }[] | undefined)?.[0]?.text,
  },
} as const

type Kind = keyof typeof kinds

const versionCount = async (collection: Kind, id: number | string) =>
  (await payload.countVersions({ collection: collection as never, where: { parent: { equals: id } }, overrideAccess: true })).totalDocs

const storedDraft = async (collection: Kind, id: number | string) =>
  (await payload.findByID({ collection: collection as never, id, draft: true, overrideAccess: true, depth: 0 })) as unknown as Record<string, unknown>

/** A published document of `collection` with the heading text `text`. */
async function publishedDoc(collection: Kind, text: string) {
  const created = await payload.create({ collection: collection as never, overrideAccess: true, data: { ...kinds[collection].data(text), _status: 'published' } as never })
  return created.id as number
}

const editHeading = (session: Awaited<ReturnType<typeof openSession>>, text: string) =>
  session.commit([{ type: 'update', id: session.layout().blocks[0].id, props: { text } }])

for (const collection of ['posts', 'articles'] as const) {
  describe(`a refused Restore or Revert keeps the session as it was (${collection})`, () => {
    it('leaves a saved published page saved when a Restore is refused: nothing new is written', { timeout: 10_000 }, async () => {
      const id = await publishedDoc(collection, 'v1')
      await payload.update({ collection: collection as never, id, draft: false, overrideAccess: true, data: { ...kinds[collection].data('v2'), _status: 'published' } as never })
      const v1 = await versionWhere(collection, id, (v) => kinds[collection].storedText(v) === 'v1')
      const session = await openSession(collection, id)
      const versions = await versionCount(collection, id)
      failRestores = true
      try {
        const result = await restoreDocumentVersion(await asAdmin(), { target: session.target, versionId: v1, runtime: runtime() })
        assert.equal(result.ok, false)
      } finally {
        failRestores = false
      }
      assert.equal(textOf(session.layout()), 'v2', 'the layout it had')
      assert.equal(session.saved(), true, 'still saved')
      assert.deepEqual(await session.flush(), { ok: true })
      assert.equal(await versionCount(collection, id), versions, 'no new version')
      const stored = await storedDraft(collection, id)
      assert.equal(stored._status, 'published', 'no draft on top of the published page')
      assert.equal(kinds[collection].storedText(stored), 'v2')
    })

    it('keeps the layout and the unsaved edit when a Revert is refused; a later Revert works', { timeout: 10_000 }, async () => {
      const id = await publishedDoc(collection, 'v1')
      const session = await openSession(collection, id)
      assert.equal((await editHeading(session, 'PENDING')).ok, true)
      failReverts = true
      try {
        const result = await runPublishAction(await asAdmin(), { target: session.target, action: 'revert', runtime: runtime() })
        assert.equal(result.ok, false)
      } finally {
        failReverts = false
      }
      assert.equal(textOf(session.layout()), 'PENDING', 'the live layout it had')
      assert.equal(session.saved(), false, 'still unsaved')
      assert.deepEqual(await session.flush(), { ok: true })
      assert.equal(kinds[collection].storedText(await storedDraft(collection, id)), 'PENDING', 'the next save stores it')
      // A Revert that works brings the published layout back, in the session and stored.
      const reverted = await runPublishAction(await asAdmin(), { target: session.target, action: 'revert', runtime: runtime() })
      assert.equal(reverted.ok, true, JSON.stringify(reverted))
      assert.equal(textOf(session.layout()), 'v1')
      const stored = await storedDraft(collection, id)
      assert.equal(kinds[collection].storedText(stored), 'v1')
      assert.equal(stored._status, 'published')
    })

    it('leaves a saved session saved when a Revert is refused: nothing new is written', { timeout: 10_000 }, async () => {
      const id = await publishedDoc(collection, 'v1')
      const session = await openSession(collection, id)
      assert.equal((await editHeading(session, 'v2')).ok, true)
      assert.deepEqual(await session.flush(), { ok: true })
      const versions = await versionCount(collection, id)
      failReverts = true
      try {
        const result = await runPublishAction(await asAdmin(), { target: session.target, action: 'revert', runtime: runtime() })
        assert.equal(result.ok, false)
      } finally {
        failReverts = false
      }
      assert.equal(textOf(session.layout()), 'v2', 'the layout it had')
      assert.equal(session.saved(), true, 'still saved')
      assert.deepEqual(await session.flush(), { ok: true })
      assert.equal(await versionCount(collection, id), versions, 'no new version')
      const stored = await storedDraft(collection, id)
      assert.equal(kinds[collection].storedText(stored), 'v2')
      assert.equal(stored._status, 'draft')
    })
  })
}

describe('a save from outside while a builder Restore runs (posts)', () => {
  it('is refused before it can publish the restored layout, and works once the Restore failed', { timeout: 10_000 }, async () => {
    const id = await publishedDoc('posts', 'v1')
    await payload.update({ collection: 'posts' as never, id, draft: false, overrideAccess: true, data: { ...kinds.posts.data('v2'), _status: 'published' } as never })
    const v1 = await versionWhere('posts', id, (v) => kinds.posts.storedText(v) === 'v1')
    const session = await openSession('posts', id)
    let started!: () => void
    const saving = new Promise<void>((resolve) => { started = resolve })
    let release!: () => void
    holdTitle = { title: 'Outside', started, until: new Promise<void>((resolve) => { release = resolve }) }
    // Another editor publishes from the Edit view. The save has the write gate before the session
    // guard runs, and reaches the guard after the Restore started.
    const publish = () => payload.update({ collection: 'posts' as never, id, draft: false, overrideAccess: true, data: { title: 'Outside', _status: 'published' } as never })
    const outside = publish().then(() => null, (error: { status?: number }) => error)
    await saving
    failRestores = true
    try {
      const restoring = restoreDocumentVersion(await asAdmin(), { target: session.target, versionId: v1, runtime: runtime() })
      for (let i = 0; i < 400 && !runtime().sessions.peek('posts', id)?.resetting; i++) await new Promise((resolve) => setTimeout(resolve, 5))
      assert.equal(runtime().sessions.peek('posts', id)?.resetting, true, 'the Restore has started')
      assert.equal(textOf(session.layout()), 'v2', 'it waits for the save that holds the write gate')
      release()
      assert.equal((await outside)?.status, 409, 'the outside save is refused')
      assert.equal((await restoring).ok, false)
    } finally {
      failRestores = false
      holdTitle = null
      release()
    }
    assert.equal(textOf(session.layout()), 'v2')
    const live = (await payload.findByID({ collection: 'posts' as never, id, draft: false, overrideAccess: true, depth: 0 })) as unknown as Record<string, unknown>
    assert.equal(kinds.posts.storedText(live), 'v2', 'the failed Restore never goes live')
    assert.equal(live.title, 'P')
    // The same save works after the Restore.
    await publish()
    const after = (await payload.findByID({ collection: 'posts' as never, id, draft: false, overrideAccess: true, depth: 0 })) as unknown as Record<string, unknown>
    assert.equal(after.title, 'Outside')
    assert.equal(kinds.posts.storedText(after), 'v2')
    assert.deepEqual(await session.flush(), { ok: true })
  })
})

/** The error a call fails with, or null. */
const failure = (run: () => Promise<unknown>) => run().then(() => null, (error: { status?: number; message?: string }) => error)

describe('bulk updates of a builder collection', () => {
  for (const collection of ['posts', 'articles'] as const) {
    it(`are refused before anything is written, also with overrideAccess, and updates by ID still work (${collection})`, { timeout: 10_000 }, async () => {
      const id = await publishedDoc(collection, 'v1')
      const versions = await versionCount(collection, id)
      const stored = await storedDraft(collection, id)
      const where = { id: { equals: id } }
      // Explicit trusted access: Payload's own `disableBulkEdit` check does not run.
      const local = await failure(() => payload.update({ collection: collection as never, where, overrideAccess: true, data: { title: 'Bulk' } as never }))
      assert.equal(local?.status, 409)
      assert.match(local?.message ?? '', /Update each document by ID\./)
      // An id of 0 runs the bulk update in the Local API.
      const zero = await failure(() => payload.update({ collection, id: 0, where, overrideAccess: true, data: { title: 'Bulk' } } as never))
      assert.equal(zero?.status, 409)
      // A user's bulk update: Payload refuses it first (`disableBulkEdit`).
      const asUser = await failure(() => payload.update({ collection: collection as never, where, data: { title: 'Bulk' } as never, overrideAccess: false, user: admin as never }))
      assert.equal(asUser?.status, 403)
      // REST: one refusal for the whole request, not a 200 with an error per document.
      const response = await handleEndpoints({
        config: payload.config,
        request: new Request(`http://localhost/api/${collection}?where[id][equals]=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Bulk' }),
        }),
      })
      assert.equal(response.status, 403)
      assert.match(JSON.stringify(await response.json()), /disabled bulk edit/)
      assert.equal(payload.collections[collection as never].config.disableBulkEdit, true, 'the list view offers no bulk edit')
      // Nothing was written.
      assert.equal(await versionCount(collection, id), versions)
      const after = await storedDraft(collection, id)
      assert.equal(after.title, stored.title)
      assert.equal(after.updatedAt, stored.updatedAt)
      // An update by ID works as before.
      await payload.update({ collection: collection as never, id, draft: true, overrideAccess: true, data: { title: 'By ID' } as never })
      assert.equal((await storedDraft(collection, id)).title, 'By ID')
    })
  }
})
