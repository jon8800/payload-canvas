// The other fields (title, slug, SEO, …) while the builder edits the layout: Payload's document
// lock survives the plugin's own saves, and a save from an old copy of the form is rejected.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { keepLockBeforeOperation, layoutAfterChange, layoutBeforeChange, SESSION_SAVE_CONTEXT } from '../plugin/hook'
import {
  changedFields,
  checkStaleSave,
  createFieldClock,
  KEEP_LOCK_CONTEXT,
  LOCKED_DOCUMENTS_SLUG,
  recordFieldChanges,
  restoreLocks,
  rememberLocks,
  staleSaveMessage,
  topFieldLabel,
  type LockPayload,
  type LockRow,
} from './fieldsGuard'
import { createSessionManager } from './session'

type Doc = Record<string, unknown>

const ana = { id: 1, email: 'ana@example.test', collection: 'users' }
const ben = { id: 2, email: 'ben@example.test', collection: 'users' }
const skip = new Set(['layout', 'layoutCss'])

describe('changedFields', () => {
  it('compares values, not formats', () => {
    const current = { title: 'Home', count: 3, tags: [5, 6], author: 9, meta: { b: 1, a: 'x' }, empty: null, layout: { blocks: [] } }
    const data = {
      title: 'Home',
      count: '3',
      tags: ['5', '6'],
      author: { id: 9, updatedAt: '2026-10-04T00:00:00.000Z' },
      meta: { a: 'x', b: 1 },
      empty: '',
      layout: { blocks: [{ id: 'x' }] },
      updatedAt: 'old',
      _status: 'published',
    }
    assert.deepEqual(changedFields(data, current, skip), [])
  })

  it('lists the fields whose value changed', () => {
    const current = { title: 'Home', slug: 'home', seo: { title: 'A' } }
    assert.deepEqual(changedFields({ title: 'Start', slug: 'home', seo: { title: 'B' } }, current, skip), ['title', 'seo'])
  })
})

describe('field clock', () => {
  it('reports only newer changes by someone else', () => {
    const clock = createFieldClock()
    clock.record('pages', 1, ['title'], { at: '2026-10-04T12:00:05.000Z', by: 'user:1', label: 'Ana' })
    const base = '2026-10-04T12:00:00.000Z'
    assert.deepEqual(clock.conflicts('pages', 1, ['title', 'slug'], { base, by: 'user:2' }), [
      { field: 'title', at: '2026-10-04T12:00:05.000Z', label: 'Ana' },
    ])
    // Your own change never conflicts with you.
    assert.deepEqual(clock.conflicts('pages', 1, ['title'], { base, by: 'user:1' }), [])
    // A form loaded after the change is not stale.
    assert.deepEqual(clock.conflicts('pages', 1, ['title'], { base: '2026-10-04T12:00:06.000Z', by: 'user:2' }), [])
    // Other documents are separate.
    assert.deepEqual(clock.conflicts('pages', 2, ['title'], { base, by: 'user:2' }), [])
  })

  it('forgets the least recently changed documents first', () => {
    const clock = createFieldClock(2)
    const change = { at: '2026-10-04T12:00:05.000Z', by: 'user:1', label: 'Ana' }
    clock.record('pages', 1, ['title'], change)
    clock.record('pages', 2, ['title'], change)
    clock.record('pages', 1, ['slug'], change)
    clock.record('pages', 3, ['title'], change)
    const args = { base: '2026-10-04T12:00:00.000Z', by: 'user:2' }
    assert.equal(clock.conflicts('pages', 2, ['title'], args).length, 0)
    assert.equal(clock.conflicts('pages', 1, ['title', 'slug'], args).length, 2)
  })
})

describe('stale-save check', () => {
  it('rejects a save that would undo a newer change by someone else', () => {
    const clock = createFieldClock()
    const stored: Doc = { id: 1, title: 'Home', slug: 'home', updatedAt: '2026-10-04T12:00:00.000Z' }

    // Ana renames the page.
    const anaContext: Doc = {}
    const anaData = { title: 'Start', slug: 'home', updatedAt: '2026-10-04T12:00:00.000Z' }
    const base = { clock, collection: 'pages', id: 1, skip, pluginSave: false }
    assert.deepEqual(checkStaleSave({ ...base, data: anaData, originalDoc: stored, user: ana, context: anaContext }), [])
    const afterAna = { ...stored, title: 'Start', updatedAt: '2026-10-04T12:00:10.000Z' }
    recordFieldChanges({ clock, collection: 'pages', doc: afterAna, user: ana, context: anaContext })

    // Ben's form was loaded before. His autosave still holds the old title and a new slug.
    const benData = { title: 'Home', slug: 'start', updatedAt: '2026-10-04T12:00:00.000Z' }
    const conflicts = checkStaleSave({ ...base, data: benData, originalDoc: afterAna, user: ben, context: {} })
    assert.deepEqual(conflicts, [{ field: 'title', at: '2026-10-04T12:00:10.000Z', label: 'ana@example.test' }])
    assert.equal(
      staleSaveMessage(conflicts, (name) => topFieldLabel([{ name: 'title', label: 'Page title', type: 'text' }], name)),
      'Not saved. ana@example.test changed Page title after you opened this form. Reload it to get their changes, then make your edit again.',
    )

    // After a reload Ben's form has Ana's title, so his slug change goes through.
    const fresh = { title: 'Start', slug: 'start', updatedAt: '2026-10-04T12:00:10.000Z' }
    assert.deepEqual(checkStaleSave({ ...base, data: fresh, originalDoc: afterAna, user: ben, context: {} }), [])
    // Ana's next autosave never conflicts with her own change.
    const again = { title: 'Start!', slug: 'home', updatedAt: '2026-10-04T12:00:00.000Z' }
    assert.deepEqual(checkStaleSave({ ...base, data: again, originalDoc: afterAna, user: ana, context: {} }), [])
  })

  it('does not check plugin saves or saves without a base, but records their changes', () => {
    const clock = createFieldClock()
    const stored: Doc = { id: 1, title: 'Home', updatedAt: '2026-10-04T12:00:00.000Z' }
    const base = { clock, collection: 'pages', id: 1, skip }
    clock.record('pages', 1, ['title'], { at: '2026-10-04T12:00:05.000Z', by: 'user:1', label: 'Ana' })
    const old = { title: 'Old', updatedAt: '2026-10-04T11:00:00.000Z' }
    // Revert to published sends the published document, with its old updatedAt.
    const context: Doc = {}
    assert.deepEqual(checkStaleSave({ ...base, data: old, originalDoc: stored, user: ben, context, pluginSave: true }), [])
    recordFieldChanges({ clock, collection: 'pages', doc: { ...stored, title: 'Old', updatedAt: '2026-10-04T12:00:20.000Z' }, user: ben, context })
    // An API client without updatedAt.
    assert.deepEqual(checkStaleSave({ ...base, data: { title: 'API' }, originalDoc: stored, user: ana, context: {}, pluginSave: false }), [])
    // The revert counts as Ben's change: Ana's old form may not undo it.
    const anaForm = { title: 'Mine', updatedAt: '2026-10-04T12:00:05.000Z' }
    assert.equal(checkStaleSave({ ...base, data: anaForm, originalDoc: stored, user: ana, context: {}, pluginSave: false }).length, 1)
  })
})

function matches(row: LockRow, where: { and: Array<Record<string, { equals: unknown }>> }): boolean {
  const doc = row.document as { relationTo: string; value: unknown }
  return where.and.every((clause) => {
    const [key, cond] = Object.entries(clause)[0]
    return key === 'document.relationTo' ? doc.relationTo === cond.equals : String(doc.value) === String(cond.equals)
  })
}

/** Payload's lock collection, in memory, behind the database adapter calls the helpers use. */
function fakeLocks(options: { locking?: boolean } = {}) {
  let rows: LockRow[] = []
  let nextId = 1
  const created: Doc[] = []
  const payload: LockPayload = {
    collections: {
      [LOCKED_DOCUMENTS_SLUG]: { config: {} },
      pages: { config: options.locking === false ? { lockDocuments: false } : {} },
    },
    db: {
      async find({ where }) {
        return { docs: rows.filter((row) => matches(row, where as never)).map((row) => structuredClone(row)) }
      },
      async create({ data }) {
        created.push(structuredClone(data as Doc))
        rows.push({ id: nextId++, ...(data as Doc) })
        return null
      },
    },
  }
  return {
    payload,
    created,
    lock(user: { id: number; collection: string }, id: string | number, updatedAt: string) {
      rows.push({
        id: nextId++,
        document: { relationTo: 'pages', value: id },
        user: { relationTo: user.collection, value: user.id },
        createdAt: updatedAt,
        updatedAt,
      })
    },
    /** Payload's checkDocumentLockStatus: deletes the document's locks on every update. */
    deleteLocks(id: string | number) {
      rows = rows.filter((row) => String((row.document as { value: unknown }).value) !== String(id))
    },
    rows: () => rows,
  }
}

describe('keeping the lock', () => {
  it('puts back the lock Payload deletes during a plugin save', async () => {
    const locks = fakeLocks()
    locks.lock(ana, 1, '2026-10-04T12:00:00.000Z')
    const context: Doc = {}
    await rememberLocks({ payload: locks.payload, req: {}, collection: 'pages', id: '1', context })
    locks.deleteLocks(1)
    assert.equal(await restoreLocks({ payload: locks.payload, req: {}, collection: 'pages', id: '1', context }), 1)
    assert.deepEqual(locks.created, [
      {
        document: { relationTo: 'pages', value: 1 },
        user: { relationTo: 'users', value: 1 },
        createdAt: '2026-10-04T12:00:00.000Z',
        updatedAt: '2026-10-04T12:00:00.000Z',
      },
    ])
    // The remembered rows are used once.
    assert.equal(await restoreLocks({ payload: locks.payload, req: {}, collection: 'pages', id: '1', context }), 0)
  })

  it('leaves a newer lock alone and does nothing when locking is off', async () => {
    const locks = fakeLocks()
    locks.lock(ana, 1, '2026-10-04T12:00:00.000Z')
    const context: Doc = {}
    await rememberLocks({ payload: locks.payload, req: {}, collection: 'pages', id: 1, context })
    locks.deleteLocks(1)
    locks.lock(ben, 1, '2026-10-04T12:00:09.000Z')
    assert.equal(await restoreLocks({ payload: locks.payload, req: {}, collection: 'pages', id: 1, context }), 0)
    assert.equal(locks.rows().length, 1)

    const off = fakeLocks({ locking: false })
    off.lock(ana, 1, '2026-10-04T12:00:00.000Z')
    const offContext: Doc = {}
    await rememberLocks({ payload: off.payload, req: {}, collection: 'pages', id: 1, context: offContext })
    assert.deepEqual(offContext, {})
  })
})

/**
 * Runs Payload's update operation the way 3.90 does: beforeOperation, the lock check (throws
 * 423 for another user's lock when `overrideLock` is false, then deletes the document's locks),
 * beforeChange, the write, afterChange.
 */
function fakeCollection() {
  const locks = fakeLocks()
  const clock = createFieldClock()
  const sessions = createSessionManager()
  const options = { collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks: [], css: { entry: 'missing.css' }, fieldClock: clock }
  const beforeOperation = keepLockBeforeOperation({ collection: 'pages' })
  const beforeChange = layoutBeforeChange(options)
  const afterChange = layoutAfterChange({ collection: 'pages', sessions, fieldClock: clock })
  const collection = { slug: 'pages', fields: [{ name: 'title', type: 'text', label: 'Title' }], versions: { drafts: true } }
  let doc: Doc = { id: 1, title: 'Home', slug: 'home', layout: { version: 1, blocks: [] }, updatedAt: '2026-10-04T12:00:00.000Z' }
  let tick = 0
  const payload = { ...locks.payload, logger: { info() {}, warn() {}, error() {} } }

  async function update(args: { data: Doc; user: typeof ana; context?: Doc; overrideLock?: boolean }) {
    const context = args.context ?? {}
    const req = { payload, context, user: args.user, t: (key: string) => key }
    await beforeOperation({ args: { id: 1, req }, context, operation: 'update', req } as never)
    if (args.overrideLock === false) {
      const lock = locks.rows()[0] as { user?: { value: unknown } } | undefined
      if (lock && lock.user?.value !== args.user.id) throw Object.assign(new Error('locked'), { status: 423 })
    }
    locks.deleteLocks(1)
    const originalDoc = structuredClone(doc)
    const data = await beforeChange({ collection, context, data: structuredClone(args.data), operation: 'update', originalDoc, req } as never)
    tick += 1
    doc = { ...doc, ...data, updatedAt: new Date(Date.UTC(2026, 9, 4, 12, 1, tick)).toISOString() }
    await afterChange({ collection, context, doc, operation: 'update', previousDoc: originalDoc, req } as never)
    return doc
  }
  return { locks, update, doc: () => doc }
}

describe('the plugin hooks', () => {

  it('a session save and a publish keep the lock of the person in the settings drawer', async () => {
    const { locks, update } = fakeCollection()
    locks.lock(ana, 1, '2026-10-04T12:00:30.000Z')
    await update({ data: { layout: { version: 1, blocks: [] } }, user: ben, context: { [SESSION_SAVE_CONTEXT]: true } })
    assert.equal(locks.rows().length, 1)
    await update({ data: { _status: 'published' }, user: ben, context: { [KEEP_LOCK_CONTEXT]: true } })
    const rows = locks.rows() as Array<{ user: { value: unknown }; updatedAt: string }>
    assert.equal(rows.length, 1)
    assert.equal(rows[0].user.value, ana.id)
    assert.equal(rows[0].updatedAt, '2026-10-04T12:00:30.000Z')
  })

  it("the lock holder's own save releases the lock, as in Payload", async () => {
    const { locks, update } = fakeCollection()
    locks.lock(ana, 1, '2026-10-04T12:00:30.000Z')
    await update({ data: { title: 'Start', updatedAt: '2026-10-04T12:00:00.000Z' }, user: ana, overrideLock: false })
    assert.equal(locks.rows().length, 0)
  })

  it('rejects a stale settings save with 409 and a readable message', async () => {
    const { update, doc } = fakeCollection()
    await update({ data: { title: 'Start', slug: 'home', updatedAt: '2026-10-04T12:00:00.000Z' }, user: ana, overrideLock: false })
    await assert.rejects(
      update({ data: { title: 'Home', slug: 'start', updatedAt: '2026-10-04T12:00:00.000Z' }, user: ben, overrideLock: false }),
      (error: { status?: number; message?: string }) => {
        assert.equal(error.status, 409)
        assert.match(error.message ?? '', /ana@example\.test changed Title after you opened this form/)
        return true
      },
    )
    assert.equal(doc().title, 'Start')
    assert.equal(doc().slug, 'home')
  })
})
