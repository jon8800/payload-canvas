// Restores and nested saves through the real Payload Local API (memory database): the builder's
// Restore and the live session's other fields, a Restore that fails, and the "Default template"
// hook that saves another template with the same request.

import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { buildConfig, createLocalReq, getPayload, type Block, type CollectionConfig, type Payload, type PayloadRequest } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import type { Layout } from '../core/types'
import type { LiveDocStore } from '../live/apply'
import { builderConfigOf, restoreDocumentVersion, runPublishAction } from '../live/document'
import { LIVE_PATH, sessionTargetOf } from '../live/endpoints'
import { liveRuntimeOf } from '../live/runtime'
import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

/** While set, a hook refuses every restore of a version. */
let failRestores = false
const refuseRestores = ({ context, data }: { context: Record<string, unknown>; data: unknown }) => {
  if (failRestores && context.isRestoringVersion) throw new Error('The restore was refused by a hook.')
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
  await runtime().sessions.connect({ target, store: store(), clientId: `c-${collection}-${id}`, user: admin, send: () => {} })
  return {
    target,
    commit: (ops: unknown[]) => runtime().sessions.commit({ target, store: store(), user: admin, actor, ops, blocks: blocks() }),
    flush: () => runtime().sessions.flush(collection, id),
    layout: () => runtime().sessions.peek(collection, id)?.layout as Layout,
  }
}

const textOf = (layout: Layout | undefined) => layout?.blocks[0]?.props?.text
const asAdmin = async () => (await createLocalReq({ user: admin as never }, payload)) as PayloadRequest

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
