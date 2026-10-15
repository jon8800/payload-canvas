import assert from 'node:assert/strict'
import { it } from 'node:test'

import { actorFromUser } from './apply'
import { createSessionManager, type SessionTarget } from './session'
import type { LiveSavedEvent, MultiplayerEvent } from './types'

const ana = { id: 1, name: 'Ana' }
const target: SessionTarget = { collection: 'pages', id: 1, field: 'layout', drafts: true }

it('tells editors about a settings save that lands while a session save is in flight', async () => {
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const saving = new Promise<void>((resolve) => {
    started = resolve
  })
  const store = {
    findByID: async () => ({ id: 1, layout: { version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'A' } }] } }),
    update: async () => {
      started()
      await blocked
      return { id: 1, updatedAt: '2026-10-15T10:00:01.000Z', _status: 'draft' }
    },
  }
  const sessions = createSessionManager({ persistDebounceMs: 1, logger: { error() {} } })
  const events: MultiplayerEvent[] = []
  await sessions.connect({ target, store: store as never, clientId: 'tab', user: ana, send: (e) => events.push(e) })
  await sessions.commit({ target, store: store as never, user: ana, actor: actorFromUser(ana), blocks: [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }], ops: [{ type: 'update', id: 'h', props: { text: 'B' } }] })
  // The session's save is in flight.
  await saving
  // The settings drawer saved meanwhile (the save hook guard calls markSaved).
  sessions.markSaved('pages', 1, 1, { updatedAt: '2026-10-15T10:00:02.000Z', status: 'draft', fields: ['title'] })
  const saved = events.filter((e): e is LiveSavedEvent => e.type === 'saved')
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0].fields, ['title'])
  // The session's own commit is not saved yet: the event names the seq that is.
  assert.equal(saved[0].seq, 0)
  release()
  await sessions.flush('pages', 1)
})

it('announces a guarded save only after its transaction committed, and never after a rollback', async () => {
  const { layoutAfterChange, GUARD_SEQ_CONTEXT } = await import('../plugin/hook')
  const { createWriteGate } = await import('./writeGate')
  const gate = createWriteGate()
  const hooks = gate.hooks('pages')
  const doc = { id: 1, layout: { version: 1, blocks: [] }, updatedAt: '2026-10-15T10:00:00.000Z' }
  const sessions = createSessionManager({ logger: { error() {} } })
  const events: MultiplayerEvent[] = []
  const store = { findByID: async () => structuredClone(doc), update: async () => doc }
  await sessions.connect({ target, store: store as never, clientId: 'tab', user: ana, send: (e) => events.push(e) })
  const afterChange = layoutAfterChange({ collection: 'pages', sessions, writeGate: gate })
  const saved = () => events.filter((e) => e.type === 'saved').length
  const save = async (outcome: 'commit' | 'rollback') => {
    const req: Record<string, unknown> = { transactionID: `tx-${outcome}`, payload: { db: { find: async () => ({ docs: [] }) }, collections: {} } }
    const args = { id: 1, req }
    await hooks.beforeOperation({ args, operation: 'update', req } as never)
    await afterChange({ collection: { slug: 'pages' }, context: { [GUARD_SEQ_CONTEXT]: { 'pages:1': 0 } }, doc, operation: 'create', previousDoc: doc, req } as never)
    // Inside the transaction: nobody hears of the save yet, so nobody reloads uncommitted values.
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(saved(), outcome === 'commit' ? 0 : 1)
    // Payload: afterOperation, then the adapter's commit. A rollback (or a failed commit) has no afterOperation.
    if (outcome === 'commit') await hooks.afterOperation({ args, operation: 'updateByID', req, result: doc } as never)
    gate.transactionEnded(req.transactionID, outcome === 'commit')
    delete req.transactionID
  }
  await save('commit')
  assert.equal(saved(), 1)
  await save('rollback')
  assert.equal(saved(), 1, 'a rolled-back save is never announced')
})
