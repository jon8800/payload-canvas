// A session save whose layout the field already stores writes nothing, so no draft version.
// Both storage modes: the builder's JSON layout and a Payload blocks field.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, Layout, Operation } from '../core/types'
import { actorFromUser, type LiveDocStore } from './apply'
import { createSessionManager, type SessionTarget } from './session'
import { JSON_CODEC, payloadBlocksCodec, type LayoutCodec } from './storage'
import type { LiveSavedEvent, MultiplayerEvent } from './types'

const ana = { id: 1, name: 'Ana' }
const blocks: BlockDefinition[] = [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }, { name: 'level', type: 'text' }] }]

const jsonLayout = (text: string): Layout => ({ version: 1, blocks: [{ id: 'h1', type: 'heading', props: { text, level: 'h2' } }] })
const blockRows = (text: string) => [{ id: 'h1', blockType: 'heading', blockName: null, text, level: 'h2' }]

const modes: { name: string; codec: LayoutCodec; stored: (text: string) => unknown }[] = [
  { name: 'JSON layout', codec: JSON_CODEC, stored: jsonLayout },
  { name: 'Payload blocks field', codec: payloadBlocksCodec({ blocks, rootTypes: ['heading'] }), stored: blockRows },
]

/** A fake Local API with one document; every update is a new version. */
function fakeStore(field: unknown) {
  let doc: Record<string, unknown> = { id: 'p1', title: 'Home', layout: structuredClone(field) }
  const writes: unknown[] = []
  const store: LiveDocStore = {
    async findByID() {
      return structuredClone(doc)
    },
    async update(args) {
      writes.push(structuredClone(args.data))
      doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>), updatedAt: new Date().toISOString(), _status: 'draft' }
      return structuredClone(doc)
    },
  }
  return { store, writes, get doc() { return doc } }
}

for (const mode of modes) {
  describe(`session saves without changes (${mode.name})`, () => {
    const target: SessionTarget = { collection: 'pages', id: 'p1', field: 'layout', drafts: true, codec: mode.codec }

    async function open(db: ReturnType<typeof fakeStore>) {
      const sessions = createSessionManager({ persistDebounceMs: 1, logger: { error() {} } })
      const events: MultiplayerEvent[] = []
      await sessions.connect({ target, store: db.store, clientId: 'tab', user: ana, send: (e) => events.push(e) })
      const commit = (ops: Operation[]) => sessions.commit({ target, store: db.store, user: ana, actor: actorFromUser(ana), blocks, ops })
      const saved = () => events.filter((e): e is LiveSavedEvent => e.type === 'saved')
      return { sessions, commit, saved }
    }

    it('writes no version when a commit sets the value the field already has', async () => {
      const db = fakeStore(mode.stored('Hello'))
      const { sessions, commit, saved } = await open(db)
      const result = await commit([{ type: 'update', id: 'h1', props: { text: 'Hello' } }])
      assert.equal(result.ok, true)
      assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
      assert.equal(db.writes.length, 0, 'no new draft version')
      assert.equal(sessions.unsaved(), 0, 'the session counts as saved')
      assert.equal(saved().at(-1)?.seq, 1, 'editors hear that everything is saved')
    })

    it('writes no version when later commits undo an edit before the save', async () => {
      const db = fakeStore(mode.stored('Hello'))
      const { sessions, commit } = await open(db)
      await commit([{ type: 'update', id: 'h1', props: { text: 'Changed' } }])
      await commit([{ type: 'update', id: 'h1', props: { text: 'Hello' } }])
      assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
      assert.equal(db.writes.length, 0)
    })

    it('still saves a real edit', async () => {
      const db = fakeStore(mode.stored('Hello'))
      const { sessions, commit } = await open(db)
      await commit([{ type: 'update', id: 'h1', props: { text: 'Changed' } }])
      assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
      assert.equal(db.writes.length, 1)
      assert.deepEqual(mode.codec.decode(db.doc.layout), mode.codec.decode(mode.stored('Changed')))
    })

    it('saves an undo back to the first value after the edit was saved', async () => {
      const db = fakeStore(mode.stored('Hello'))
      const { sessions, commit } = await open(db)
      await commit([{ type: 'update', id: 'h1', props: { text: 'Changed' } }])
      await sessions.flush('pages', 'p1')
      await commit([{ type: 'update', id: 'h1', props: { text: 'Hello' } }])
      assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
      assert.equal(db.writes.length, 2, 'the stored value differs from the layout again')
      assert.deepEqual(mode.codec.decode(db.doc.layout), mode.codec.decode(mode.stored('Hello')))
    })

    it('saves a cleared value', async () => {
      const db = fakeStore(mode.stored('Hello'))
      const { sessions, commit } = await open(db)
      await commit([{ type: 'update', id: 'h1', props: { level: null } }])
      assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
      assert.equal(db.writes.length, 1)
    })

    it('compares with the stored value, not with the value the session opened with', async () => {
      const db = fakeStore(mode.stored('Hello'))
      const { sessions, commit } = await open(db)
      // A save outside the session stored another value meanwhile (the guarded Edit view save
      // stores the session's layout; here a direct write stands in for any outside save).
      await db.store.update({ collection: 'pages', id: 'p1', data: { layout: mode.stored('Outside') } })
      db.writes.length = 0
      await commit([{ type: 'update', id: 'h1', props: { text: 'Hello' } }])
      assert.deepEqual(await sessions.flush('pages', 'p1'), { ok: true })
      assert.equal(db.writes.length, 1)
      assert.deepEqual(mode.codec.decode(db.doc.layout), mode.codec.decode(mode.stored('Hello')))
    })
  })
}
