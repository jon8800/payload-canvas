// The document's other fields that access checks read (`currentDoc`): read again after every
// committed save, never used after a failed read, and a check that a save overtakes runs again.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, Layout } from '../core/types'
import type { LiveDocStore } from './apply'
import { createSessionManager, type SessionTarget } from './session'

const blocks: BlockDefinition[] = [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }]
const layout: Layout = { version: 1, blocks: [{ id: 'h1', type: 'heading', props: { text: 'Hi' } }] }
const target: SessionTarget = { collection: 'pages', id: 'p1', field: 'layout', drafts: true }
const user = { id: 1, email: 'ana@x.test' }
const actor = { type: 'user' as const, id: 'users:1', label: 'Ana' }

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

/** Timers that never fire: no debounced save runs unless a test flushes. */
const stillTimers = { now: () => 0, set: () => 0, clear: () => {} }

/** A fake Local API with one document. `failReads` reads throw; `onUpdate` changes what a save stores. */
function fakeStore() {
  const state = {
    doc: { id: 'p1', private: false, title: 'Home', layout: structuredClone(layout) } as Record<string, unknown>,
    failReads: 0,
    reads: 0,
    onUpdate: (data: Record<string, unknown>) => data,
  }
  const store: LiveDocStore = {
    async findByID() {
      state.reads += 1
      if (state.failReads > 0) {
        state.failReads -= 1
        throw new Error('DB down')
      }
      return structuredClone(state.doc)
    },
    async update(args) {
      state.doc = { ...state.doc, ...state.onUpdate(structuredClone(args.data as Record<string, unknown>)) }
      return structuredClone(state.doc)
    },
  }
  return { state, store }
}

function setup() {
  const errors: string[] = []
  const sessions = createSessionManager({ timers: stillTimers, logger: { error: (message) => errors.push(message) } })
  const db = fakeStore()
  const connect = () => sessions.connect({ target, store: db.store, clientId: 'c1', user, send: () => {} })
  const commit = (access?: (doc: Record<string, unknown>) => Promise<string | null>) =>
    sessions.commit({
      target,
      store: db.store,
      user,
      actor,
      blocks,
      ops: [{ type: 'update', id: 'h1', props: { text: 'Changed' } }],
      ...(access ? { access: ({ doc }: { doc: Record<string, unknown> }) => access(doc) } : {}),
    })
  return { sessions, db, errors, connect, commit }
}

describe('currentDoc: the fields access checks read', () => {
  it('reads the fields again after a save from outside that left the layout alone', async () => {
    const { sessions, db, connect } = setup()
    await connect()
    db.state.doc = { ...db.state.doc, private: true }
    sessions.externalSaved('pages', 'p1', { fields: ['private'] })
    assert.equal((await sessions.currentDoc('pages', 'p1'))?.private, true)
    assert.equal('layout' in ((await sessions.currentDoc('pages', 'p1')) ?? {}), false, 'without the builder field')
  })

  it('reads the fields again after a guarded save (markSaved), and a commit checks those', async () => {
    const { sessions, db, connect, commit } = setup()
    await connect()
    db.state.doc = { ...db.state.doc, private: true }
    sessions.markSaved('pages', 'p1', 0, {})
    const result = await commit(async (doc) => (doc.private ? 'private' : null))
    assert.equal(result.ok, false)
    assert.equal((result as { status: number }).status, 403)
    assert.equal(sessions.peek('pages', 'p1')?.layout.blocks[0].props?.text, 'Hi', 'not applied')
  })

  it('never uses the old fields after a failed read: it reads once more, then refuses', async () => {
    const { sessions, db, connect, commit, errors } = setup()
    await connect()
    db.state.doc = { ...db.state.doc, private: true }
    db.state.failReads = 2
    sessions.externalSaved('pages', 'p1', {})
    await assert.rejects(sessions.currentDoc('pages', 'p1'))
    assert.ok(errors.some((e) => e.includes('could not') || e.includes('Could not')))
    db.state.failReads = 2
    sessions.externalSaved('pages', 'p1', {})
    const refused = await commit(async () => null)
    assert.equal(refused.ok, false)
    assert.equal((refused as { status: number }).status, 503)
    assert.equal(sessions.peek('pages', 'p1')?.seq, 0, 'not applied')
    // The database is back: the next check reads the fields again.
    assert.equal((await sessions.currentDoc('pages', 'p1'))?.private, true)
    assert.equal((await commit(async (doc) => (doc.private ? null : 'stale'))).ok, true)
  })

  it('runs a check again when a save commits while it runs', async () => {
    const { sessions, db, connect, commit } = setup()
    await connect()
    const seen: unknown[] = []
    const checked = await sessions.withCurrentDoc('pages', 'p1', async (doc) => {
      seen.push(doc.private)
      if (seen.length === 1) {
        // A save lands during the first check.
        db.state.doc = { ...db.state.doc, private: true }
        sessions.externalSaved('pages', 'p1', {})
        await settle()
      }
      return doc.private ? 'private' : null
    })
    assert.deepEqual(seen, [false, true])
    assert.deepEqual(checked, { value: 'private' })
    // The same inside a commit: the second run refuses, nothing applies.
    db.state.doc = { ...db.state.doc, private: false }
    sessions.externalSaved('pages', 'p1', {})
    let runs = 0
    const result = await commit(async (doc) => {
      runs += 1
      if (runs === 1) {
        db.state.doc = { ...db.state.doc, private: true }
        sessions.markSaved('pages', 'p1', 0, {})
      }
      return doc.private ? 'private' : null
    })
    assert.equal(runs, 2)
    assert.equal(result.ok, false)
    assert.equal(sessions.peek('pages', 'p1')?.layout.blocks[0].props?.text, 'Hi')
  })

  it('refuses a check that saves keep overtaking, and gives no answer for a closed document', async () => {
    const { sessions, connect, commit } = setup()
    await connect()
    const always = async () => {
      sessions.externalSaved('pages', 'p1', {})
      return null
    }
    await assert.rejects(sessions.withCurrentDoc('pages', 'p1', always))
    const result = await commit(always)
    assert.equal(result.ok, false)
    assert.equal((result as { status: number }).status, 503)
    assert.equal(await sessions.withCurrentDoc('pages', 'other', async () => null), null)
    assert.equal(await sessions.currentDoc('pages', 'other'), null)
  })

  it("reads the fields again after the session's own save of a JSON layout (its hooks may change them)", async () => {
    const { sessions, db, connect, commit } = setup()
    await connect()
    db.state.onUpdate = (data) => ({ ...data, title: 'Set by a hook' })
    assert.equal((await commit()).ok, true)
    assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
    assert.equal((await sessions.currentDoc('pages', 'p1'))?.title, 'Set by a hook')
  })
})
