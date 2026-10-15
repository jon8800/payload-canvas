// The write gate learns when a save ends from the adapter's commit (and from Payload's Local API).
// These runs have no plugin `onInit` before their first save (`payload migrate` uses
// `disableOnInit`, and migrations on connect run before it), or share one transaction across new
// request objects (Payload's `req: { transactionID }` pattern). Every save must still end its hold.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildConfig, commitTransaction, createLocalReq, getPayload, initTransaction, type CollectionConfig, type Payload } from 'payload'

import { defaultWriteGate } from '../live/writeGate'
import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

/** Well below the gate's 30 s wait: a save that waits for a hold nobody releases fails this. */
const FAST_MS = 5_000

/** A Payload instance of its own (its own cache key, collection slug and memory database). */
async function instance(slug: string, options: { disableOnInit?: boolean } = {}): Promise<Payload> {
  const pages: CollectionConfig = {
    slug,
    versions: { drafts: true },
    access: { read: () => true, create: () => true, update: () => true, delete: () => true },
    fields: [{ name: 'title', type: 'text' }],
  }
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [{ slug: 'users', auth: true, fields: [] }, pages],
    plugins: [websiteBuilder({ collections: { [slug]: {} }, blocks: [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }], css: { entry: 'globals.css' }, theme: false })],
  })
  return getPayload({ config, key: slug, ...(options.disableOnInit ? { disableOnInit: true } : {}) })
}

async function timed<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  const result = await fn()
  assert.ok(Date.now() - start < FAST_MS, `took ${Date.now() - start} ms: it waited for a hold`)
  return result
}

const update = (payload: Payload, slug: string, id: number | string, title: string, req?: object) =>
  payload.update({ collection: slug as never, id, draft: true, overrideAccess: true, data: { title } as never, ...(req ? { req: req as never } : {}) })

describe('the write gate without the plugin onInit', () => {
  it('ends each save of `payload migrate` (disableOnInit): one request and transaction per migration', { timeout: 10_000 }, async () => {
    const slug = 'pages-migrate'
    const payload = await instance(slug, { disableOnInit: true })
    const doc = await payload.create({ collection: slug as never, draft: true, overrideAccess: true, data: { title: 'Seed' } as never })
    for (const name of ['migration-1', 'migration-2']) {
      const req = await createLocalReq({}, payload)
      await initTransaction(req)
      await timed(async () => {
        await update(payload, slug, doc.id, name, req)
        await commitTransaction(req)
      })
    }
    assert.equal((await payload.findByID({ collection: slug as never, id: doc.id, draft: true, overrideAccess: true })).title, 'migration-2')
    await timed(() => update(payload, slug, doc.id, 'after'))
  })

  it('ends saves without a request of their own (each runs its own transaction)', { timeout: 10_000 }, async () => {
    const slug = 'pages-noreq'
    const payload = await instance(slug, { disableOnInit: true })
    const doc = await payload.create({ collection: slug as never, draft: true, overrideAccess: true, data: { title: 'Seed' } as never })
    await timed(() => update(payload, slug, doc.id, 'one'))
    await timed(() => update(payload, slug, doc.id, 'two'))
  })

  it('ends a migration that ran before onInit (migrations on connect), and the first save after start goes through', { timeout: 10_000 }, async () => {
    const slug = 'pages-prod'
    const payload = await instance(slug, { disableOnInit: true })
    const doc = await payload.create({ collection: slug as never, draft: true, overrideAccess: true, data: { title: 'Seed' } as never })
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    await timed(async () => {
      await update(payload, slug, doc.id, 'migrated', req)
      await commitTransaction(req)
    })
    await payload.config.onInit?.(payload)
    await timed(() => update(payload, slug, doc.id, 'edited'))
    assert.equal((await payload.findByID({ collection: slug as never, id: doc.id, draft: true, overrideAccess: true })).title, 'edited')
  })
})

describe('the write gate with one transaction across request objects', () => {
  it('lets a new request object in the same transaction join the hold, and the commit ends it', { timeout: 10_000 }, async () => {
    const slug = 'pages-sharedtx'
    const payload = await instance(slug)
    const doc = await payload.create({ collection: slug as never, draft: true, overrideAccess: true, data: { title: 'Seed' } as never })
    const transactionID = await payload.db.beginTransaction()
    assert.ok(transactionID)
    // Payload's documented pattern: `req: { transactionID }` per call. Both stay referenced, so
    // only the commit can end the hold.
    const first = { transactionID }
    const second = { transactionID }
    await timed(() => update(payload, slug, doc.id, 'one', first))
    await timed(() => update(payload, slug, doc.id, 'two', second))
    await payload.db.commitTransaction(transactionID)
    assert.equal(defaultWriteGate().holds(first), false)
    assert.equal(defaultWriteGate().holds(second), false)
    await timed(() => update(payload, slug, doc.id, 'after'))
    assert.equal((await payload.findByID({ collection: slug as never, id: doc.id, draft: true, overrideAccess: true })).title, 'after')
  })

  it('still runs saves of other transactions one after the other', { timeout: 10_000 }, async () => {
    const slug = 'pages-twotx'
    const payload = await instance(slug)
    const doc = await payload.create({ collection: slug as never, draft: true, overrideAccess: true, data: { title: 'Seed' } as never })
    const t1 = (await payload.db.beginTransaction())!
    const t2 = (await payload.db.beginTransaction())!
    const one = { transactionID: t1 }
    const two = { transactionID: t2 }
    await update(payload, slug, doc.id, 'one', one)
    let second = false
    const later = update(payload, slug, doc.id, 'two', two).then(() => {
      second = true
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(second, false, 'the other transaction waits for the first one')
    assert.equal(defaultWriteGate().holds(one), true)
    await payload.db.commitTransaction(t1)
    await later
    assert.equal(second, true)
    await payload.db.commitTransaction(t2)
    assert.equal(defaultWriteGate().holds(two), false)
  })
})
