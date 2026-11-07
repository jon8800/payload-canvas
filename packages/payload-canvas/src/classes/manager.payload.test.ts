// The class manager's server actions through the real Payload Local API (memory database): rename
// and delete while a document has an open live session with unsaved edits (the edits survive and
// the change lands on top of them), where-used across collections, and "Remove unused classes".

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildConfig, createLocalReq, getPayload, type CollectionConfig, type Payload, type PayloadRequest } from 'payload'

import type { BlockDefinition, Layout, Operation } from '../core/types'
import { actorFromUser, type LiveDocStore } from '../live/apply'
import { builderConfigOf } from '../live/document'
import { sessionTargetOf } from '../live/endpoints'
import { liveRuntimeOf } from '../live/runtime'
import { memoryAdapter } from '../plugin/memoryAdapter.test-data'
import { websiteBuilder } from '../plugin'
import { classUsage, deleteClass, removeUnusedClasses, renameClass, unusedClasses, upsertClass } from './index'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '../../node_modules/.cache/payload-canvas-class-manager-test')

const all = { read: () => true, create: () => true, update: () => true, delete: () => true }
const collection = (slug: string): CollectionConfig => ({
  slug,
  versions: { drafts: true },
  access: all,
  admin: { useAsTitle: 'title' },
  fields: [{ name: 'title', type: 'text' }],
})
const heading: BlockDefinition = { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }
const admin = { id: 1, collection: 'users', email: 'admin@example.test' }
const SLUG = 'builder-classes'

let payload: Payload
const asAdmin = async () => (await createLocalReq({ user: admin as never }, payload)) as PayloadRequest
const sessions = () => liveRuntimeOf(payload).sessions
const layoutOf = (classes: string[]): Layout => ({ version: 1, blocks: classes.map((className, i) => ({ id: `b${i}`, type: 'heading', props: { text: `T${i}` }, ...(className ? { className } : {}) })) })
const classNames = (layout: unknown) => ((layout as Layout).blocks ?? []).map((b) => b.className ?? '')
const texts = (layout: unknown) => ((layout as Layout).blocks ?? []).map((b) => b.props?.text)

async function create(slug: string, title: string, classes: string[], published = false) {
  return (await payload.create({
    collection: slug as never,
    data: { title, layout: layoutOf(classes), _status: published ? 'published' : 'draft' } as never,
    draft: !published,
    overrideAccess: true,
  })) as unknown as { id: number }
}

const stored = async (slug: string, id: number, draft = true) =>
  ((await payload.findByID({ collection: slug as never, id, draft, depth: 0, overrideAccess: true })) as unknown as { layout: Layout }).layout

/** An editor's edit in the document's live session, not saved yet. */
async function editInSession(slug: string, id: number, ops: Operation[]) {
  const builder = builderConfigOf(payload)!
  const target = sessionTargetOf(payload, builder.collections, slug, String(id))!
  const result = await sessions().commit({
    target,
    store: payload as unknown as LiveDocStore,
    user: admin as never,
    actor: actorFromUser(admin as never),
    ops,
    blocks: [heading],
    localization: null,
  })
  assert.ok(result.ok, !result.ok ? result.error : '')
}

before(async () => {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'entry.css'), '@import "tailwindcss";\n')
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [{ slug: 'users', auth: true, fields: [] }, collection('pages'), collection('posts')],
    plugins: [
      websiteBuilder({
        collections: { pages: {}, posts: {} },
        blocks: [heading],
        css: { entry: path.join(dir, 'entry.css') },
        theme: false,
      }),
    ],
  })
  payload = await getPayload({ config })
})

describe('class manager', { concurrency: false, timeout: 60_000 }, () => {
  let cardId: string | number
  let pageId: number
  let postId: number

  it('lists where a class is used across collections, with the open session counted', async () => {
    const req = await asAdmin()
    const created = await upsertClass(req, { name: 'card', styles: 'p-4', publish: true })
    assert.ok(created.ok, !created.ok ? created.error : '')
    cardId = created.class.id
    pageId = (await create('pages', 'Home', ['card p-2', 'text-lg'])).id
    postId = (await create('posts', 'Hello', ['md:card'])).id
    // An editor adds the class to a block in the post, not saved yet: it counts already.
    await editInSession('posts', postId, [{ type: 'update', id: 'b0', className: 'md:card hover:card' }])
    const usage = (await classUsage(req, ['card'])).card!
    assert.equal(usage.blocks, 2)
    assert.deepEqual(
      usage.documents.map((d) => [d.collection, d.title, d.blocks]),
      [
        ['pages', 'Home', 1],
        ['posts', 'Hello', 1],
      ],
    )
  })

  it('a rename keeps an open session’s unsaved edits and applies on top of them', async () => {
    // Unsaved edit in the page's session: a new heading text.
    await editInSession('pages', pageId, [{ type: 'update', id: 'b1', props: { text: 'Edited' } }])
    const result = await renameClass(await asAdmin(), cardId, 'panel')
    assert.ok(result.ok, !result.ok ? result.error : '')
    assert.equal(result.replaced.documents, 2)
    const live = sessions().peek('pages', pageId)!
    assert.deepEqual(classNames(live.layout), ['panel p-2', 'text-lg'])
    assert.deepEqual(texts(live.layout), ['T0', 'Edited'], 'the editor’s unsaved edit is still there')
    assert.deepEqual(classNames(sessions().peek('posts', postId)!.layout), ['md:panel hover:panel'])
    await sessions().flushAll()
    const saved = await stored('pages', pageId)
    assert.deepEqual(classNames(saved), ['panel p-2', 'text-lg'])
    assert.deepEqual(texts(saved), ['T0', 'Edited'])
  })

  it('a delete with removal keeps unsaved edits too', async () => {
    await editInSession('posts', postId, [{ type: 'update', id: 'b0', props: { text: 'Draft text' } }])
    const done = await deleteClass(await asAdmin(), cardId, { removeFromBlocks: true })
    assert.ok(done.ok, !done.ok ? done.error : '')
    assert.equal(done.replaced.blocks, 2)
    await sessions().flushAll()
    const post = await stored('posts', postId)
    assert.deepEqual(classNames(post), [''])
    assert.deepEqual(texts(post), ['Draft text'])
    assert.deepEqual(classNames(await stored('pages', pageId)), ['p-2', 'text-lg'])
  })

  it('removes only unused classes: a class used in a draft, a session, a published page or by a former name stays', async () => {
    const req = await asAdmin()
    for (const name of ['unused-a', 'unused-b', 'in-draft', 'in-session', 'in-published', 'renamed']) {
      const result = await upsertClass(req, { name, styles: 'p-1', publish: true })
      assert.ok(result.ok, !result.ok ? result.error : '')
    }
    await create('pages', 'Draft page', ['in-draft'])
    await editInSession('posts', postId, [{ type: 'update', id: 'b0', className: 'in-session' }])
    // Published with the class, then the draft drops it: the live site still uses it.
    const live = await create('pages', 'Live page', ['in-published'], true)
    await payload.update({ collection: 'pages', id: live.id, data: { layout: layoutOf(['']) } as never, draft: true, overrideAccess: true })
    await sessions().flushAll()
    // A page uses the old name of a renamed class.
    await create('pages', 'Old name', ['old-name'])
    const renamed = await upsertClass(req, { name: 'renamed' })
    assert.ok(renamed.ok)
    await payload.update({ collection: SLUG as never, id: renamed.class.id, data: { previousNames: ['old-name'] } as never, overrideAccess: true })

    assert.deepEqual((await unusedClasses(req)).map((c) => c.name).toSorted(), ['unused-a', 'unused-b'])
    const result = await removeUnusedClasses(req)
    assert.ok(result.ok, !result.ok ? result.error : '')
    assert.deepEqual(result.deleted.toSorted(), ['unused-a', 'unused-b'])
    assert.deepEqual(result.failed, [])
    const left = (await payload.find({ collection: SLUG as never, overrideAccess: true, pagination: false, sort: 'name' })).docs.map((d) => (d as unknown as { name: string }).name)
    assert.deepEqual(left, ['in-draft', 'in-published', 'in-session', 'renamed'])
  })
})
