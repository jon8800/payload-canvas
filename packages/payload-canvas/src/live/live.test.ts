import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { captureFieldSemantics } from '../core/fieldSemantics'
import { applyOperations } from '../core/operations'
import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { layoutAfterChange, layoutBeforeChange, STORED_LAYOUT_CONTEXT } from '../plugin/hook'
import { actorFromUser, resolveOperations, type LiveDocStore } from './apply'
import { requestActor, sessionStream, sseFrame } from './endpoints'
import { createKeyedMutex } from './mutex'
import { JSON_CODEC, payloadBlocksCodec, type LayoutCodec } from './storage'
import { createWriteGate, writeKey } from './writeGate'
import {
  COLLABORATOR_COLORS,
  collaboratorColor,
  collaboratorName,
  createSessionManager,
  sanitizeAwareness,
  type CommitArgs,
  type SessionManagerOptions,
  type SessionTarget,
} from './session'
import type { LiveActor, LiveCommitEvent, LiveSaveFailedEvent, LiveSessionEvent, MultiplayerEvent } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', required: true }] },
]

const base: Layout = {
  version: 1,
  blocks: [
    {
      id: 's1',
      type: 'stack',
      slots: { children: [{ id: 'h1', type: 'heading', props: { text: 'Hi' } }] },
    },
  ],
}

const ai: LiveActor = { type: 'ai', id: 'mcp-key:1', label: 'Claude' }
const ana = { id: 1, name: 'Ana', email: 'ana@x.test' }
const bob = { id: 2, email: 'bob@x.test' }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** Lets pending promise chains (fake saves) finish. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}
const target: SessionTarget = { collection: 'pages', id: 'p1', field: 'layout', drafts: true, autosave: true }

const dbDown = () => new Error('DB down')

/** A fake Payload Local API with one document. Reads and writes can be slowed down or fail. */
function fakeStore(layout: unknown = base, timing: { read?: number; write?: number } = {}) {
  let doc: Record<string, unknown> = { id: 'p1', layout: structuredClone(layout) }
  const writes: Record<string, unknown>[] = []
  let failures = 0
  let failure = dbDown
  const store: LiveDocStore = {
    async findByID(args) {
      if (timing.read) await delay(timing.read)
      if (args.id !== 'p1') throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(doc)
    },
    async update(args) {
      if (timing.write) await delay(timing.write)
      if (failures > 0) {
        failures -= 1
        throw failure()
      }
      writes.push(structuredClone(args))
      doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
      return structuredClone(doc)
    },
  }
  return {
    store,
    writes,
    get doc() {
      return doc
    },
    failNext(n: number, error?: () => Error) {
      failures = n
      if (error) failure = error
    },
  }
}

/** Manual clock: timers run only inside `advance`. */
function fakeTimers() {
  let now = 0
  let next = 1
  const pending = new Map<number, { at: number; fn: () => void }>()
  return {
    timers: {
      now: () => now,
      set(fn: () => void, ms: number) {
        const id = next++
        pending.set(id, { at: now + ms, fn })
        return id
      },
      clear(handle: unknown) {
        pending.delete(handle as number)
      },
    },
    async advance(ms: number) {
      const end = now + ms
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | null = null
        for (const entry of pending) if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry
        if (!due) break
        pending.delete(due[0])
        now = due[1].at
        due[1].fn()
        await settle()
      }
      now = end
      await settle()
    },
    get now() {
      return now
    },
  }
}

function setup(options: SessionManagerOptions = {}, layout: Layout = base) {
  const clock = fakeTimers()
  const errors: string[] = []
  const sessions = createSessionManager({ timers: clock.timers, logger: { error: (m) => errors.push(m) }, ...options })
  const db = fakeStore(layout)
  const connect = async (clientId: string, user: unknown = ana, after?: { seq: number; sessionId?: string }) => {
    const events: MultiplayerEvent[] = []
    const ids: (string | undefined)[] = []
    const connection = await sessions.connect({
      target,
      store: db.store,
      clientId,
      user,
      ...(after ? { after } : {}),
      send: (event, id) => {
        events.push(event)
        ids.push(id)
      },
    })
    return { events, ids, connection }
  }
  const commit = (ops: unknown[], extra: { clientId?: string; batchId?: string; baseSeq?: number; actor?: LiveActor; user?: unknown } = {}) =>
    sessions.commit({ target, store: db.store, user: extra.user ?? ana, actor: extra.actor ?? actorFromUser(ana), ops, blocks, ...extra })
  return { sessions, clock, db, connect, commit, errors }
}

const heading = (id: string, text = 'New') => ({ id, type: 'heading', props: { text } })
const headingRows = (text: string) => [{ id: 'h1', blockType: 'heading', text }]

function hold() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function headingLayout(text: string): Layout {
  return { version: 1, blocks: [heading('h1', text)] }
}

function resetSetup(codec: LayoutCodec) {
  const clock = fakeTimers()
  const gate = createWriteGate()
  const sessions = createSessionManager({ timers: clock.timers, gate })
  const codecTarget = { ...target, codec }
  const original = headingLayout('ORIGINAL')
  const db = fakeStore(codec.encode(original))
  const key = writeKey(target.collection, target.id)
  const connect = (store = db.store) => sessions.connect({ target: codecTarget, store, clientId: 'a', user: ana, send: () => {} })
  const edit = (text: string) => sessions.commit({
    target: codecTarget, store: db.store, user: ana, actor: actorFromUser(ana), blocks,
    ops: [{ type: 'update', id: 'h1', props: { text } }],
  })
  const save = (value: Layout) => gate.run(key, {}, async () => {
    const saved = await db.store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(value) } })
    sessions.externalSaved(target.collection, target.id, {})
    return saved
  })
  const reset = (value: Layout, action: () => Promise<unknown>) => sessions.resetFor(target.collection, target.id, value, codec.encode(value), action)
  return { clock, gate, sessions, layout: headingLayout, original, db, key, connect, edit, save, reset }
}

describe('reset failure after a queued save', () => {
  for (const editDuringReset of [false, true]) {
    it(`keeps storage consistent when an edit during the reset is ${editDuringReset}`, async () => {
      const gate = createWriteGate()
      const { sessions, clock, db, connect, commit } = setup({ gate })
      await connect('a')
      const resetLayout = structuredClone(base)
      resetLayout.blocks[0].slots!.children[0].props!.text = 'RESET'
      let fail!: (error: Error) => void
      const held = new Promise<never>((_, reject) => { fail = reject })
      const resetting = sessions.resetFor(target.collection, target.id, resetLayout, resetLayout, () =>
        gate.run(writeKey(target.collection, target.id), {}, () => held),
      )
      await settle()
      if (editDuringReset) {
        assert.equal((await commit([{ type: 'update', id: 'h1', props: { text: 'RESET+EDIT' } }])).ok, true)
        await clock.advance(1000)
        assert.equal(db.writes.length, 0, 'the session save waits for the action')
      }
      fail(new Error('refused'))
      await assert.rejects(resetting, /refused/)
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, base)
      assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
      assert.deepEqual(db.doc.layout, base, 'saved content matches the restored screen')
      assert.equal(sessions.unsaved(), 0)
      assert.equal(db.writes.length, 0, 'transient reset edits never reach storage')
    })
  }

  it('does not start a queued Payload blocks save or its read when the reset fails', async () => {
    const codec = payloadBlocksCodec({ blocks, rootTypes: ['heading'] })
    const blockTarget = { ...target, codec }
    const original = headingRows('Hi')
    const clock = fakeTimers()
    const gate = createWriteGate()
    const sessions = createSessionManager({ timers: clock.timers, gate, logger: { error: () => {} } })
    let doc = { id: 'p1', layout: original } as Record<string, unknown>
    let writes = 0
    let readsAfterWrite = 0
    const store: LiveDocStore = {
      async findByID() {
        if (writes > 0) {
          readsAfterWrite += 1
          throw new Error('Read after save failed')
        }
        return structuredClone(doc)
      },
      async update(args) {
        writes += 1
        doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
        return structuredClone(doc)
      },
    }
    await sessions.connect({ target: blockTarget, store, clientId: 'a', user: ana, send: () => {} })
    let fail!: (error: Error) => void
    const held = new Promise<never>((_, reject) => { fail = reject })
    const resetting = sessions.resetFor(target.collection, target.id, codec.decode(headingRows('RESET')), headingRows('RESET'), () =>
      gate.run(writeKey(target.collection, target.id), {}, () => held),
    )
    await settle()
    const result = await sessions.commit({
      target: blockTarget, store, user: ana, actor: actorFromUser(ana), blocks,
      ops: [{ type: 'update', id: 'h1', props: { text: 'RESET+EDIT' } }],
    })
    assert.equal(result.ok, true)
    await clock.advance(1000)
    assert.equal(writes, 0, 'the session save waits for the action')
    fail(new Error('refused'))
    await assert.rejects(resetting, /refused/)
    assert.deepEqual(doc.layout, original, 'the paused save never writes the transient edit')
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, codec.decode(original))
    assert.equal(sessions.unsaved(), 0)
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(doc.layout, original)
    assert.equal(writes, 0)
    assert.equal(readsAfterWrite, 0)
    assert.equal(sessions.unsaved(), 0)
  })

  it('corrects an outside save acknowledged at the reset sequence', async () => {
    const gate = createWriteGate()
    const { sessions, db, connect } = setup({ gate })
    await connect('a')
    const resetLayout = structuredClone(base)
    resetLayout.blocks[0].slots!.children[0].props!.text = 'RESET'
    let fail!: (error: Error) => void
    const held = new Promise<never>((_, reject) => { fail = reject })
    const resetting = sessions.resetFor(target.collection, target.id, resetLayout, resetLayout, () => held)
    await settle()
    await gate.run(writeKey(target.collection, target.id), {}, async () => {
      await db.store.update({ collection: target.collection, id: target.id, data: { layout: resetLayout } })
      sessions.markSaved(target.collection, target.id, sessions.peek(target.collection, target.id)!.seq)
    })
    fail(new Error('refused'))
    await assert.rejects(resetting, /refused/)
    assert.equal(sessions.unsaved(), 1)
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(db.doc.layout, base)
    assert.equal(db.writes.length, 2)
  })

  it('keeps an outside layout change pending when a reset fails', async () => {
    const gate = createWriteGate()
    const { sessions, db, connect } = setup({ gate })
    await connect('a')
    let fail!: (error: Error) => void
    const resetting = sessions.resetFor(target.collection, target.id, base, base, () =>
      new Promise<never>((_, reject) => { fail = reject }),
    )
    await settle()
    const external = structuredClone(base)
    external.blocks[0].slots!.children[0].props!.text = 'EXTERNAL'
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const saving = gate.run(writeKey(target.collection, target.id), {}, async () => {
      await db.store.update({ collection: target.collection, id: target.id, data: { layout: external } })
      sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
      await held
    })
    await settle()
    fail(new Error('refused'))
    await assert.rejects(resetting, /refused/)
    assert.equal(sessions.unsaved(), 1, 'the outside layout has not been read yet')
    release()
    await saving
    await settle()
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, external)
    assert.deepEqual(db.doc.layout, external)
    assert.equal(db.writes.length, 1, 'the outside save is kept')
    assert.equal(sessions.unsaved(), 0)
  })

  it('resumes an outside blocks refresh that was pending before a failed reset', async () => {
    const codec = payloadBlocksCodec({ blocks, rootTypes: ['heading'] })
    const blockTarget = { ...target, codec }
    const clock = fakeTimers()
    const gate = createWriteGate()
    const sessions = createSessionManager({ timers: clock.timers, gate })
    let doc: Record<string, unknown> = { id: 'p1', layout: headingRows('ORIGINAL') }
    let writes = 0
    const store: LiveDocStore = {
      async findByID() { return structuredClone(doc) },
      async update(args) {
        writes += 1
        doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
        return structuredClone(doc)
      },
    }
    await sessions.connect({ target: blockTarget, store, clientId: 'a', user: ana, send: () => {} })
    const key = writeKey(target.collection, target.id)
    let commitOutside!: () => void
    const outsideHeld = new Promise<void>((resolve) => { commitOutside = resolve })
    const outside = gate.run(key, {}, async () => {
      await outsideHeld
      await store.update({ collection: target.collection, id: target.id, data: { layout: headingRows('EXTERNAL') } })
      sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
    })
    await settle()
    // This operation queues before the outside save's refresh, keeping that refresh pending.
    let releaseNext!: () => void
    const nextHeld = new Promise<void>((resolve) => { releaseNext = resolve })
    const next = gate.run(key, {}, async () => {
      await nextHeld
      throw new Error('other save refused')
    })
    const nextResult = assert.rejects(next, /other save refused/)
    commitOutside()
    await outside
    let failReset!: (error: Error) => void
    const resetHeld = new Promise<never>((_, reject) => { failReset = reject })
    const resetting = sessions.resetFor(target.collection, target.id, codec.decode(headingRows('RESET')), headingRows('RESET'), () =>
      gate.run(key, {}, () => resetHeld),
    )
    await settle()
    releaseNext()
    await nextResult
    await settle()
    failReset(new Error('reset refused'))
    await assert.rejects(resetting, /reset refused/)
    assert.equal(sessions.unsaved(), 1, 'the outside layout still needs reading')
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, codec.decode(headingRows('EXTERNAL')))
    assert.deepEqual(doc.layout, headingRows('EXTERNAL'))
    assert.equal(writes, 1, 'taking the outside save does not write another draft')
    assert.equal(sessions.unsaved(), 0)
  })
})

describe('reset with an outside read in flight', () => {
  for (const codec of [JSON_CODEC, payloadBlocksCodec({ blocks, rootTypes: ['heading'] })]) {
    it(`waits for the read of an outside ${codec.kind} save, then drops the transient edit of a failed reset`, async () => {
      const clock = fakeTimers()
      const gate = createWriteGate()
      const sessions = createSessionManager({ timers: clock.timers, gate })
      const codecTarget = { ...target, codec }
      const initial: Layout = { version: 1, blocks: [heading('h1', 'ORIGINAL')] }
      const external: Layout = { version: 1, blocks: [heading('h1', 'EXTERNAL'), heading('outside', 'EXTERNAL ONLY')] }
      const reset: Layout = { version: 1, blocks: [heading('h1', 'RESET')] }
      let doc: Record<string, unknown> = { id: 'p1', layout: codec.encode(initial) }
      let writes = 0
      let holdNextRead = false
      let releaseRead!: () => void
      let readStarted!: () => void
      const readHeld = new Promise<void>((resolve) => { releaseRead = resolve })
      const reading = new Promise<void>((resolve) => { readStarted = resolve })
      const store: LiveDocStore = {
        async findByID() {
          const snapshot = structuredClone(doc)
          if (holdNextRead) {
            holdNextRead = false
            readStarted()
            await readHeld
          }
          return snapshot
        },
        async update(args) {
          writes += 1
          doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
          return structuredClone(doc)
        },
      }
      await sessions.connect({ target: codecTarget, store, clientId: 'a', user: ana, send: () => {} })
      const key = writeKey(target.collection, target.id)
      await gate.run(key, {}, async () => {
        await store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(external) } })
        sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
        holdNextRead = true
      })
      await reading
      const action = hold()
      const resetting = sessions.resetFor(target.collection, target.id, reset, codec.encode(reset), () =>
        gate.run(key, {}, async () => {
          await action.promise
          throw new Error('action refused')
        }),
      )
      const rejected = assert.rejects(resetting, /action refused/)
      await settle()
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, initial, 'the reset waits for the read that holds the write gate')
      releaseRead()
      await settle()
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, reset)
      assert.equal((await sessions.commit({
        target: codecTarget, store, user: ana, actor: actorFromUser(ana), blocks,
        ops: [{ type: 'update', id: 'h1', props: { text: 'RESET+EDIT' } }],
      })).ok, true)
      await clock.advance(1000)
      assert.equal(writes, 1, 'the action has not finished')
      action.release()
      await rejected
      assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, external, 'the transient reset edit is discarded')
      assert.deepEqual(doc.layout, codec.encode(external), 'every value and block from the outside save stays')
      assert.equal(writes, 1, 'the failed reset never writes its transient edits')
      assert.equal(sessions.unsaved(), 0)
    })

    for (const automatic of [false, true]) {
      it(`takes an outside ${codec.kind} read in flight when a reset times out at the write gate (${automatic ? 'automatic' : 'flush'})`, async () => {
        const clock = fakeTimers()
        const gate = createWriteGate({ waitMs: 15 })
        const sessions = createSessionManager({ timers: clock.timers, gate })
        const codecTarget = { ...target, codec }
        const initial: Layout = { version: 1, blocks: [heading('h1', 'ORIGINAL')] }
        const external: Layout = { version: 1, blocks: [heading('h1', 'EXTERNAL')] }
        const reset: Layout = { version: 1, blocks: [heading('h1', 'RESET')] }
        let doc: Record<string, unknown> = { id: 'p1', layout: codec.encode(initial) }
        let writes = 0
        let holdNextRead = false
        let releaseRead!: () => void
        let readStarted!: () => void
        const readHeld = new Promise<void>((resolve) => { releaseRead = resolve })
        const reading = new Promise<void>((resolve) => { readStarted = resolve })
        const store: LiveDocStore = {
          async findByID() {
            const snapshot = structuredClone(doc)
            if (holdNextRead) {
              holdNextRead = false
              readStarted()
              await readHeld
            }
            return snapshot
          },
          async update(args) {
            writes += 1
            doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
            return structuredClone(doc)
          },
        }
        await sessions.connect({ target: codecTarget, store, clientId: 'a', user: ana, send: () => {} })
        const key = writeKey(target.collection, target.id)
        await gate.run(key, {}, async () => {
          await store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(external) } })
          sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
          holdNextRead = true
        })
        await reading
        // The gate's timeout is unref'd; keep the process alive until it refuses the reset.
        const keepAlive = setInterval(() => {}, 1000)
        let flushing: ReturnType<typeof sessions.flush> | undefined
        try {
          await assert.rejects(sessions.resetFor(target.collection, target.id, reset, codec.encode(reset), () =>
            gate.run(key, {}, async () => assert.fail('the reset must time out before it can write')),
          ), /another save/)
          assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, initial, 'the reset never started')
          assert.equal(sessions.unsaved(), 1, 'the outside read is still pending')
          if (!automatic) {
            let finished = false
            flushing = sessions.flush(target.collection, target.id).then((result) => {
              finished = true
              return result
            })
            await settle()
            assert.equal(finished, false, 'flush must wait for the outside read')
          }
        } finally {
          clearInterval(keepAlive)
          releaseRead()
        }
        await settle()
        if (automatic) await clock.advance(1000)
        else assert.deepEqual(await flushing, { ok: true })
        assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, external)
        assert.deepEqual(doc.layout, codec.encode(external))
        assert.equal(writes, 1, 'the refresh does not write another draft')
        assert.equal(sessions.unsaved(), 0)
      })
    }

    it(`starts a successful reset after the read of an outside ${codec.kind} save, which never comes back`, async () => {
      const initial: Layout = { version: 1, blocks: [heading('h1', 'ORIGINAL')] }
      const reset: Layout = { version: 1, blocks: [heading('h1', 'RESET')] }
      const external: Layout = { version: 1, blocks: [heading('h1', 'EXTERNAL'), heading('outside', 'EXTERNAL ONLY')] }
      const clock = fakeTimers()
      const gate = createWriteGate()
      const sessions = createSessionManager({ timers: clock.timers, gate })
      const codecTarget = { ...target, codec }
      let doc: Record<string, unknown> = { id: 'p1', layout: codec.encode(initial) }
      let writes = 0
      let holdNextRead = false
      let releaseRead!: () => void
      let readStarted!: () => void
      const readHeld = new Promise<void>((resolve) => { releaseRead = resolve })
      const reading = new Promise<void>((resolve) => { readStarted = resolve })
      const store: LiveDocStore = {
        async findByID() {
          const snapshot = structuredClone(doc)
          if (holdNextRead) {
            holdNextRead = false
            readStarted()
            await readHeld
          }
          return snapshot
        },
        async update(args) {
          writes += 1
          doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
          return structuredClone(doc)
        },
      }
      await sessions.connect({ target: codecTarget, store, clientId: 'a', user: ana, send: () => {} })
      const key = writeKey(target.collection, target.id)
      await gate.run(key, {}, async () => {
        await store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(external) } })
        sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
        // The non-layout refresh already started. Hold the queued layout read.
        holdNextRead = true
      })
      await reading
      const resetting = sessions.resetFor(target.collection, target.id, reset, codec.encode(reset), () =>
        gate.run(key, {}, async () => {
          const saved = await store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(reset) } })
          sessions.externalSaved(target.collection, target.id, {})
          return saved
        }),
      )
      await settle()
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, initial, 'the reset waits for the read that holds the write gate')
      releaseRead()
      await resetting
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, reset, 'the outside layout read before cannot replace the reset')
      assert.deepEqual(doc.layout, codec.encode(reset))
      assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
      assert.equal(sessions.unsaved(), 0)
      assert.equal(writes, 2)
      assert.equal((await sessions.commit({
        target: codecTarget, store, user: ana, actor: actorFromUser(ana), blocks,
        ops: [{ type: 'update', id: 'h1', props: { text: 'RESET+EDIT' } }],
      })).ok, true)
      assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
      const edited: Layout = { version: 1, blocks: [heading('h1', 'RESET+EDIT')] }
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, edited)
      assert.deepEqual(doc.layout, codec.encode(edited), 'the next edit cannot revive the outside blocks')
      assert.equal(writes, 3)
      assert.equal(sessions.unsaved(), 0)
    })
  }
})

describe('outside read retries', () => {
  for (const codec of [JSON_CODEC, payloadBlocksCodec({ blocks, rootTypes: ['heading'] })]) {
    it(`retains a failed ${codec.kind} refresh and retries with backoff`, async () => {
      const clock = fakeTimers()
      const gate = createWriteGate()
      const sessions = createSessionManager({ timers: clock.timers, gate, logger: { error: () => {} } })
      const codecTarget = { ...target, codec }
      const initial: Layout = { version: 1, blocks: [heading('h1', 'ORIGINAL')] }
      const external: Layout = { version: 1, blocks: [heading('h1', 'EXTERNAL')] }
      let doc: Record<string, unknown> = { id: 'p1', layout: codec.encode(initial) }
      let writes = 0
      let reads = 0
      let failures = 0
      const store: LiveDocStore = {
        async findByID() {
          reads += 1
          if (failures > 0) {
            failures -= 1
            throw new Error('Outside read failed')
          }
          return structuredClone(doc)
        },
        async update(args) {
          writes += 1
          doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
          return structuredClone(doc)
        },
      }
      await sessions.connect({ target: codecTarget, store, clientId: 'a', user: ana, send: () => {} })
      await gate.run(writeKey(target.collection, target.id), {}, async () => {
        await store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(external) } })
        sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
        failures = 3
      })
      await settle()
      assert.equal(sessions.unsaved(), 1)
      const beforeAutomatic = reads
      await clock.advance(1000)
      assert.equal(reads, beforeAutomatic + 1, 'the first failed read retries automatically')
      assert.equal((await sessions.flush(target.collection, target.id)).ok, false, 'a failed refresh is not saved')
      assert.equal(sessions.unsaved(), 1, 'a retry that fails must keep the pending refresh')
      const beforeRetry = reads
      await clock.advance(4999)
      assert.equal(reads, beforeRetry, 'failed reads use the save backoff')
      await clock.advance(1)
      assert.equal(reads, beforeRetry + 1)
      assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, external)
      assert.deepEqual(doc.layout, codec.encode(external))
      assert.equal(writes, 1, 'retries only read the outside save')
      assert.equal(sessions.unsaved(), 0)
    })
  }
})

describe('reset action boundaries', () => {
  for (const codec of [JSON_CODEC, payloadBlocksCodec({ blocks, rootTypes: ['heading'] })]) {
    for (const priorEdit of [false, true]) {
      it(`${codec.kind}: a failed reset restores ${priorEdit ? 'pending edits' : 'a clean document'}`, async () => {
        const h = resetSetup(codec)
        await h.connect()
        if (priorEdit) assert.equal((await h.edit('BEFORE')).ok, true)
        const action = hold()
        const resetting = h.reset(h.layout('RESET'), async () => {
          await action.promise
          throw new Error('refused')
        })
        const rejected = assert.rejects(resetting, /refused/)
        await settle()
        assert.equal((await h.edit('RESET+EDIT')).ok, true)
        await h.clock.advance(5000)
        assert.equal(h.db.writes.length, 0)
        action.release()
        await rejected
        const expected = priorEdit ? h.layout('BEFORE') : h.original
        assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, expected)
        assert.deepEqual(await h.sessions.flush(target.collection, target.id), { ok: true })
        assert.deepEqual(h.db.doc.layout, codec.encode(expected))
        assert.equal(h.db.writes.length, priorEdit ? 1 : 0)
      })
    }

    for (const firstSucceeds of [false, true]) {
      for (const secondSucceeds of [false, true]) {
        it(`${codec.kind}: serializes resets with outcomes ${firstSucceeds}/${secondSucceeds}`, async () => {
          const h = resetSetup(codec)
          await h.connect()
          const action = hold()
          const first = h.reset(h.layout('FIRST'), async () => {
            await action.promise
            if (!firstSucceeds) throw new Error('first refused')
            return h.save(h.layout('FIRST'))
          }).then(() => true, () => false)
          await settle()
          let secondStarted = false
          const second = h.reset(h.layout('SECOND'), async () => {
            secondStarted = true
            if (!secondSucceeds) throw new Error('second refused')
            return h.save(h.layout('SECOND'))
          }).then(() => true, () => false)
          await settle()
          const startedEarly = secondStarted
          const during = h.sessions.peek(target.collection, target.id)!.layout
          action.release()
          assert.deepEqual(await Promise.all([first, second]), [firstSucceeds, secondSucceeds])
          assert.equal(startedEarly, false)
          assert.deepEqual(during, h.layout('FIRST'))
          assert.deepEqual(await h.sessions.flush(target.collection, target.id), { ok: true })
          const expected = secondSucceeds ? h.layout('SECOND') : firstSucceeds ? h.layout('FIRST') : h.original
          assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, expected)
          assert.deepEqual(h.db.doc.layout, codec.encode(expected))
          assert.equal(h.db.writes.length, Number(firstSucceeds) + Number(secondSucceeds))
        })
      }
    }

    it(`${codec.kind}: public reset waits for a reset action`, async () => {
      const h = resetSetup(codec)
      await h.connect()
      const action = hold()
      const resetting = h.reset(h.layout('FIRST'), async () => {
        await action.promise
        throw new Error('refused')
      })
      const rejected = assert.rejects(resetting, /refused/)
      await settle()
      const second = h.sessions.reset(target.collection, target.id, h.layout('SECOND'), codec.encode(h.layout('SECOND')))
      await settle()
      const during = h.sessions.peek(target.collection, target.id)!.layout
      action.release()
      await rejected
      assert.equal(await second, true)
      assert.deepEqual(during, h.layout('FIRST'))
      assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, h.layout('SECOND'))
    })

    for (const succeeds of [false, true]) {
      it(`${codec.kind}: flush and flushAll wait for an action that ${succeeds ? 'succeeds' : 'fails'}`, async () => {
        const h = resetSetup(codec)
        await h.connect()
        const action = hold()
        const resetting = h.reset(h.layout('RESET'), async () => {
          await action.promise
          if (!succeeds) throw new Error('refused')
          return h.save(h.layout('RESET'))
        }).then(() => true, () => false)
        await settle()
        assert.equal((await h.edit('RESET+EDIT')).ok, true)
        let flushed = false
        let flushedAll = false
        const flushing = h.sessions.flush(target.collection, target.id).then((result) => { flushed = true; return result })
        const flushingAll = h.sessions.flushAll().then(() => { flushedAll = true })
        await settle()
        const finishedEarly = flushed || flushedAll
        action.release()
        assert.equal(await resetting, succeeds)
        assert.deepEqual(await flushing, { ok: true })
        await flushingAll
        assert.equal(finishedEarly, false)
        const expected = succeeds ? h.layout('RESET+EDIT') : h.original
        assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, expected)
        assert.deepEqual(h.db.doc.layout, codec.encode(expected))
        assert.equal(h.db.writes.length, succeeds ? 2 : 0)
      })
    }

    it(`${codec.kind}: a save pauses when a reset starts during its outside read`, async () => {
      const h = resetSetup(codec)
      await h.connect()
      const outside = hold()
      const read = hold()
      const reading = hold()
      let holdNextRead = false
      const findByID = h.db.store.findByID
      h.db.store.findByID = async (args) => {
        const shouldHold = holdNextRead
        holdNextRead = false
        const snapshot = await findByID(args)
        if (shouldHold) {
          reading.release()
          await read.promise
        }
        return snapshot
      }
      const external: Layout = { version: 1, blocks: [heading('h1', 'EXTERNAL'), heading('outside', 'EXTERNAL ONLY')] }
      const outsideSave = h.gate.run(h.key, {}, async () => {
        await outside.promise
        await h.db.store.update({ collection: target.collection, id: target.id, data: { layout: codec.encode(external) } })
        h.sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
        holdNextRead = true
      })
      assert.equal((await h.edit('BEFORE')).ok, true)
      await h.clock.advance(1000)
      outside.release()
      await outsideSave
      await reading.promise
      const resetting = h.reset(h.layout('RESET'), async () => { throw new Error('refused') })
      const rejected = assert.rejects(resetting, /refused/)
      await settle()
      read.release()
      await rejected
      assert.equal(h.db.writes.length, 1, 'the save must pause after its read too')
      assert.deepEqual(h.db.doc.layout, codec.encode(external))
      assert.deepEqual(await h.sessions.flush(target.collection, target.id), { ok: true })
      const expected: Layout = { version: 1, blocks: [heading('h1', 'BEFORE'), heading('outside', 'EXTERNAL ONLY')] }
      assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, expected)
      assert.deepEqual(h.db.doc.layout, codec.encode(expected))
      assert.equal(h.db.writes.length, 2, 'only the restored pending edit needs a save')
    })

    it(`${codec.kind}: a queued save pauses after it gets the write gate`, async () => {
      const h = resetSetup(codec)
      await h.connect()
      const outside = hold()
      const outsideSave = h.gate.run(h.key, {}, () => outside.promise)
      assert.equal((await h.edit('BEFORE')).ok, true)
      await h.clock.advance(1000)
      const action = hold()
      const resetting = h.reset(h.layout('RESET'), async () => {
        await action.promise
        throw new Error('refused')
      })
      const rejected = assert.rejects(resetting, /refused/)
      await settle()
      outside.release()
      await outsideSave
      await settle()
      assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, h.layout('RESET'))
      assert.equal(h.db.writes.length, 0, 'the already queued save also pauses')
      action.release()
      await rejected
      assert.deepEqual(await h.sessions.flush(target.collection, target.id), { ok: true })
      assert.deepEqual(h.db.doc.layout, codec.encode(h.layout('BEFORE')))
      assert.equal(h.db.writes.length, 1)
    })

    it(`${codec.kind}: a long action keeps its session after the last editor leaves`, async () => {
      const h = resetSetup(codec)
      const connection = await h.connect()
      connection.leave()
      const action = hold()
      const resetting = h.reset(h.layout('RESET'), async () => {
        await action.promise
        throw new Error('refused')
      })
      const rejected = assert.rejects(resetting, /refused/)
      await settle()
      await h.clock.advance(120_000)
      const retained = h.sessions.size()
      action.release()
      await rejected
      assert.equal(retained, 1)
      assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, h.original)
      assert.equal(h.db.writes.length, 0)
      await h.clock.advance(60_000)
      assert.equal(h.sessions.size(), 0, 'normal eviction resumes')
    })

    it(`${codec.kind}: a late connection and flush wait when the action started without a session`, async () => {
      const h = resetSetup(codec)
      const action = hold()
      const resetting = h.reset(h.layout('RESET'), async () => {
        await action.promise
        return h.save(h.layout('RESET'))
      })
      await settle()
      let connected = false
      let flushed = false
      const connecting = h.connect().then(() => { connected = true })
      const flushing = h.sessions.flushAll().then(() => { flushed = true })
      await settle()
      const finishedEarly = connected || flushed
      action.release()
      await resetting
      await Promise.all([connecting, flushing])
      assert.equal(finishedEarly, false)
      assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, h.layout('RESET'))
      assert.deepEqual(h.db.doc.layout, codec.encode(h.layout('RESET')))
      assert.equal(h.db.writes.length, 1)
    })

    it(`${codec.kind}: an initial read spanning an entire action reloads the final document`, async () => {
      const h = resetSetup(codec)
      const read = hold()
      let reads = 0
      const store: LiveDocStore = {
        ...h.db.store,
        async findByID(args) {
          const snapshot = await h.db.store.findByID(args)
          reads += 1
          if (reads === 1) await read.promise
          return snapshot
        },
      }
      const connecting = h.connect(store)
      await settle()
      const resetting = h.reset(h.layout('RESET'), () => h.save(h.layout('RESET')))
      await resetting
      read.release()
      await connecting
      assert.equal(reads, 2)
      assert.deepEqual(h.sessions.peek(target.collection, target.id)!.layout, h.layout('RESET'))
      assert.deepEqual(h.db.doc.layout, codec.encode(h.layout('RESET')))
    })
  }
})

/**
 * A JSON layout document saved through the real save hooks (the session guard and its after-commit
 * report). Payload with drafts: the published document and the newest draft are stored apart.
 */
function guardSetup() {
  const clock = fakeTimers()
  const gate = createWriteGate()
  const sessions = createSessionManager({ timers: clock.timers, gate, logger: { error: () => {} } })
  let published: Record<string, unknown> = { id: 'p1', layout: headingLayout('ORIGINAL'), _status: 'published' }
  let draft = structuredClone(published)
  const writes: { draft: boolean; layout: unknown }[] = []
  const store: LiveDocStore = {
    async findByID() {
      return structuredClone(draft)
    },
    async update(args) {
      const data = structuredClone(args.data as Record<string, unknown>)
      draft = { ...draft, ...data }
      if (args.draft === false) published = structuredClone(draft)
      writes.push({ draft: args.draft !== false, layout: data.layout })
      return structuredClone(draft)
    },
  }
  const key = writeKey(target.collection, target.id)
  const req = { payload: { logger: { info() {}, warn() {}, error() {} } }, t: (s: string) => s }
  const before = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css: { entry: 'does-not-exist.css' }, sessions }) as unknown as (
    args: unknown,
  ) => Promise<Record<string, unknown>>
  const after = layoutAfterChange({ collection: 'pages', sessions, writeGate: gate }) as unknown as (args: unknown) => Promise<unknown>
  /**
   * One update as Payload runs it: it takes the write gate, reads the document (`reading`), runs the
   * guard, writes (`writing`), and reports the save after its commit.
   */
  const save = (
    data: Record<string, unknown>,
    options: { publish?: boolean; context?: Record<string, unknown>; reading?: Promise<void>; writing?: Promise<void> } = {},
  ) =>
    gate.run(key, {}, async () => {
      await options.reading
      const context: Record<string, unknown> = { ...options.context }
      const out = await before({ collection: { versions: { drafts: true } }, context, data, operation: 'update', originalDoc: { ...draft, id: 'p1' }, req })
      await options.writing
      const saved = await store.update({ collection: target.collection, id: target.id, data: out, draft: !options.publish })
      await after({ context, doc: saved })
      return saved
    })
  const connect = (clientId = 'a') => sessions.connect({ target, store, clientId, user: ana, send: () => {} })
  const edit = (text: string, access?: CommitArgs['access']) =>
    sessions.commit({ target, store, user: ana, actor: actorFromUser(ana), blocks, ops: [{ type: 'update', id: 'h1', props: { text } }], ...(access ? { access } : {}) })
  const peek = () => sessions.peek(target.collection, target.id)!
  const flush = () => sessions.flush(target.collection, target.id)
  return {
    clock, gate, sessions, key, save, connect, edit, peek, flush, writes,
    get published() { return published },
    get draft() { return draft },
  }
}

/** The answer of a promise, or the error it failed with. */
const outcome = <T>(promise: Promise<T>) => promise.then((value) => ({ value, error: null }), (error: { status?: number }) => ({ value: null, error }))

describe('guarded saves during a reset action', () => {
  it('refuses a Publish that reaches the guard during a Restore, and publishes the restored screen after the Restore fails', async () => {
    const h = guardSetup()
    await h.connect()
    // Publish saved the session first (nothing to save) and holds the gate; it still reads the document.
    assert.deepEqual(await h.flush(), { ok: true })
    const reading = hold()
    const publishing = outcome(h.save({ _status: 'published' }, { publish: true, reading: reading.promise }))
    await settle()
    const restoring = h.sessions.resetFor(target.collection, target.id, headingLayout('OLD VERSION'), headingLayout('OLD VERSION'), () =>
      h.gate.run(h.key, {}, async () => {
        throw new Error('restore refused')
      }),
    )
    const restored = assert.rejects(restoring, /restore refused/)
    await settle()
    const during = h.peek().resetting
    reading.release()
    const published = await publishing
    await restored
    assert.equal(published.error?.status, 409, 'Publish is refused while the Restore runs')
    assert.deepEqual(h.published.layout, headingLayout('ORIGINAL'), 'the failed Restore never goes live')
    assert.equal(during, true)
    assert.equal(h.peek().resetting, undefined)
    // Publish again: it publishes what the editors see.
    await h.save({ _status: 'published' }, { publish: true })
    assert.deepEqual(h.published.layout, headingLayout('ORIGINAL'))
    assert.deepEqual(await h.flush(), { ok: true })
    assert.deepEqual(h.draft.layout, headingLayout('ORIGINAL'))
    assert.deepEqual(h.writes.map((w) => w.draft), [false], 'nothing else was written')
    assert.equal(h.sessions.unsaved(), 0)
  })

  it('refuses a settings save that gets the gate between a failed Revert and its rollback, and saves it after', async () => {
    const h = guardSetup()
    await h.connect()
    const action = hold()
    const reverting = h.sessions.resetFor(target.collection, target.id, headingLayout('RESET'), headingLayout('RESET'), () =>
      h.gate.run(h.key, {}, async () => {
        await action.promise
        throw new Error('revert refused')
      }),
    )
    const reverted = assert.rejects(reverting, /revert refused/)
    await settle()
    // An edit on the reset layout holds the session lock while its access check runs.
    const access = hold()
    const editing = h.edit('RESET+EDIT', async () => {
      await access.promise
      return null
    })
    await settle()
    // The settings drawer's autosave waits for the gate behind the Revert.
    const drawer = outcome(h.save({ title: 'New title' }))
    await settle()
    action.release()
    await settle()
    access.release()
    assert.equal((await editing).ok, true)
    await reverted
    assert.equal((await drawer).error?.status, 409, 'the drawer is refused before it copies the reset layout')
    await h.clock.advance(10_000)
    assert.deepEqual(await h.flush(), { ok: true })
    assert.deepEqual(h.peek().layout, headingLayout('ORIGINAL'))
    assert.deepEqual(h.draft.layout, headingLayout('ORIGINAL'), 'the reset layout never reaches storage')
    assert.equal(h.writes.length, 0)
    // The drawer keeps its values and saves them again.
    await h.save({ title: 'New title' })
    assert.equal(h.draft.title, 'New title')
    assert.deepEqual(h.draft.layout, headingLayout('ORIGINAL'))
    assert.equal(h.sessions.unsaved(), 0)
  })

  it("lets the Revert's own save through the guard, and refuses another save with the same context", async () => {
    const h = guardSetup()
    await h.connect()
    const action = hold()
    const context = { [STORED_LAYOUT_CONTEXT]: true }
    const reverting = h.sessions.resetFor(target.collection, target.id, headingLayout('PUBLISHED'), headingLayout('PUBLISHED'), async () => {
      await action.promise
      return h.save({ layout: headingLayout('PUBLISHED'), _status: 'published' }, { publish: true, context })
    })
    await settle()
    // A plugin save of this document from another request (for example a template's "Default" flag).
    const other = await outcome(h.save({ title: 'Other' }, { context }))
    action.release()
    await reverting
    assert.equal(other.error?.status, 409)
    assert.deepEqual(h.published.layout, headingLayout('PUBLISHED'))
    assert.deepEqual(await h.flush(), { ok: true })
    assert.deepEqual(h.writes.map((w) => w.draft), [false])
    assert.equal(h.sessions.unsaved(), 0)
  })

  for (const succeeds of [false, true]) {
    it(`a Revert waits for a guarded save that read the session before it (Revert ${succeeds ? 'works' : 'fails'})`, async () => {
      const h = guardSetup()
      await h.connect()
      // The drawer read the session before the Revert started, and still holds the write gate.
      const writing = hold()
      const drawer = h.save({ title: 'New title' }, { writing: writing.promise })
      await settle()
      const action = hold()
      const reverting = h.sessions.resetFor(target.collection, target.id, headingLayout('PUBLISHED'), headingLayout('PUBLISHED'), async () => {
        await action.promise
        if (!succeeds) throw new Error('revert refused')
        return h.save({ layout: headingLayout('PUBLISHED'), _status: 'published' }, { publish: true, context: { [STORED_LAYOUT_CONTEXT]: true } })
      })
      const reverted = succeeds ? reverting : assert.rejects(reverting, /revert refused/)
      await settle()
      assert.deepEqual(h.peek().layout, headingLayout('ORIGINAL'), 'the Revert waits for the save that holds the write gate')
      writing.release()
      await drawer
      await settle()
      assert.deepEqual(h.peek().layout, headingLayout('PUBLISHED'))
      assert.equal((await h.edit('PUBLISHED+EDIT')).ok, true)
      action.release()
      await reverted
      await h.clock.advance(10_000)
      assert.deepEqual(await h.flush(), { ok: true })
      const expected = succeeds ? headingLayout('PUBLISHED+EDIT') : headingLayout('ORIGINAL')
      assert.deepEqual(h.peek().layout, expected)
      assert.deepEqual(h.draft.layout, expected)
      assert.equal(h.draft.title, 'New title')
      assert.equal(h.sessions.unsaved(), 0)
    })
  }

  it('refuses a save that an earlier action started when it runs during a later action', async () => {
    const h = guardSetup()
    await h.connect()
    const late = hold()
    let child!: ReturnType<typeof outcome>
    await h.sessions.resetFor(target.collection, target.id, headingLayout('FIRST'), headingLayout('FIRST'), async () => {
      // A save the first Revert starts and does not wait for.
      child = outcome((async () => {
        await late.promise
        return h.save({ title: 'Late' })
      })())
      return h.save({ layout: headingLayout('FIRST'), _status: 'published' }, { publish: true, context: { [STORED_LAYOUT_CONTEXT]: true } })
    })
    const second = hold()
    const reverting = h.sessions.resetFor(target.collection, target.id, headingLayout('SECOND'), headingLayout('SECOND'), async () => {
      await second.promise
      throw new Error('second refused')
    })
    const reverted = assert.rejects(reverting, /second refused/)
    await settle()
    late.release()
    const result = await child
    second.release()
    await reverted
    assert.equal(result.error?.status, 409, "the first Revert's late save is not the second one's")
    await h.clock.advance(10_000)
    assert.deepEqual(await h.flush(), { ok: true })
    assert.deepEqual(h.peek().layout, headingLayout('FIRST'))
    assert.deepEqual(h.draft.layout, headingLayout('FIRST'))
    assert.equal(h.draft.title, undefined)
    assert.equal(h.sessions.unsaved(), 0)
  })

  it("a guarded save that read a closed session never marks the next session's edits as saved", async () => {
    const h = guardSetup()
    const first = await h.connect('a')
    assert.equal((await h.edit('FIRST')).ok, true)
    assert.deepEqual(await h.flush(), { ok: true })
    const writing = hold()
    const drawer = h.save({ title: 'New title' }, { writing: writing.promise })
    await settle()
    first.leave()
    await h.clock.advance(60_000)
    assert.equal(h.sessions.size(), 0)
    await h.connect('b')
    assert.equal((await h.edit('SECOND')).ok, true)
    writing.release()
    await drawer
    assert.equal(h.sessions.unsaved(), 1, "the new session's edit is not saved yet")
    assert.deepEqual(await h.flush(), { ok: true })
    assert.deepEqual(h.draft.layout, headingLayout('SECOND'))
    assert.equal(h.draft.title, 'New title')
  })
})

describe('hook changes of a guarded save and a reset', () => {
  it('applies the hook changes of a save that committed before a reset, before the reset replaces the state', async () => {
    const { sessions, db, connect } = setup({}, headingLayout('ORIGINAL'))
    await connect('a')
    // A guarded save read the session before the Revert started. Its write is still running.
    const read = sessions.peek(target.collection, target.id)!
    const access = hold()
    const action = hold()
    // An edit holds the session lock while its access check runs, and is refused.
    const editing = sessions.commit({
      target, store: db.store, user: ana, actor: actorFromUser(ana), blocks,
      ops: [{ type: 'update', id: 'h1', props: { text: 'REFUSED' } }],
      access: async () => {
        await access.promise
        return 'refused'
      },
    })
    await settle()
    const reverting = sessions.resetFor(target.collection, target.id, headingLayout('RESET'), headingLayout('RESET'), async () => {
      await action.promise
      throw new Error('revert refused')
    })
    const reverted = assert.rejects(reverting, /revert refused/)
    await settle()
    // The guarded save commits: the layout its prop hooks changed, then the after-commit pair.
    await db.store.update({ collection: target.collection, id: target.id, data: { layout: headingLayout('HOOKED') } })
    sessions.markSaved(target.collection, target.id, read.seq, { sessionId: read.sessionId })
    sessions.adoptSaved(target.collection, target.id, { input: read.layout, output: headingLayout('HOOKED'), seq: read.seq, sessionId: read.sessionId })
    access.release()
    assert.equal((await editing).ok, false)
    await settle()
    action.release()
    await reverted
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, headingLayout('HOOKED'))
    assert.equal(sessions.unsaved(), 0)
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(db.doc.layout, headingLayout('HOOKED'))
    assert.equal(db.writes.length, 1, 'only the guarded save wrote')
  })

  it('waits for a guarded save that holds the write gate: a failed reset puts back its hook changes', async () => {
    const gate = createWriteGate()
    const { sessions, clock, db, connect } = setup({ gate }, headingLayout('ORIGINAL'))
    await connect('a')
    const read = sessions.peek(target.collection, target.id)!
    const key = writeKey(target.collection, target.id)
    // A guarded save copied the session before the Revert started. It still holds the write gate.
    const writing = hold()
    const saving = gate.run(key, {}, async () => {
      await writing.promise
      await db.store.update({ collection: target.collection, id: target.id, data: { layout: headingLayout('HOOKED') } })
      sessions.markSaved(target.collection, target.id, read.seq, { sessionId: read.sessionId })
      sessions.adoptSaved(target.collection, target.id, { input: read.layout, output: headingLayout('HOOKED'), seq: read.seq, sessionId: read.sessionId })
    })
    await settle()
    const reverting = sessions.resetFor(target.collection, target.id, headingLayout('RESET'), headingLayout('RESET'), () =>
      gate.run(key, {}, async () => {
        throw new Error('revert refused')
      }),
    )
    const reverted = assert.rejects(reverting, /revert refused/)
    await settle()
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, headingLayout('ORIGINAL'), 'the Revert waits for the save')
    writing.release()
    await saving
    await reverted
    await clock.advance(10_000)
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(db.doc.layout, headingLayout('HOOKED'), 'the committed hook change stays stored')
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, headingLayout('HOOKED'))
    assert.equal(db.writes.length, 1, 'nothing writes over it')
    assert.equal(sessions.unsaved(), 0)
  })

  it('applies the hook changes of a save that read another session, and saves them again', async () => {
    const { sessions, clock, db, connect } = setup({}, headingLayout('ORIGINAL'))
    const first = await connect('a')
    const read = sessions.peek(target.collection, target.id)!
    first.connection.leave()
    await clock.advance(60_000)
    assert.equal(sessions.size(), 0)
    await connect('b')
    await db.store.update({ collection: target.collection, id: target.id, data: { layout: headingLayout('HOOKED') } })
    sessions.markSaved(target.collection, target.id, read.seq, { sessionId: read.sessionId })
    sessions.adoptSaved(target.collection, target.id, { input: read.layout, output: headingLayout('HOOKED'), seq: read.seq, sessionId: read.sessionId })
    await settle()
    assert.deepEqual(sessions.peek(target.collection, target.id)!.layout, headingLayout('HOOKED'))
    assert.equal(sessions.unsaved(), 1, "another session's seq never counts as saved here")
    assert.deepEqual(await sessions.flush(target.collection, target.id), { ok: true })
    assert.deepEqual(db.doc.layout, headingLayout('HOOKED'))
    assert.equal(sessions.unsaved(), 0)
  })
})

/** Two headings: `h1` (the text a prop hook changes) and `h2` (the text editors change). */
const layoutWith = (h1: string, h2 = 'B'): Layout => ({ version: 1, blocks: [heading('h1', h1), heading('h2', h2)] })

/**
 * A JSON layout document whose updates run as Payload runs them: through the write gate and the real
 * save hooks. A prop hook changes the text "ORIGINAL" (of `h1`) only in saves whose context asks
 * for it (a hook that depends on the save, so a later save does not repeat it).
 */
function hookedSetup() {
  const clock = fakeTimers()
  const gate = createWriteGate()
  const sessions = createSessionManager({ timers: clock.timers, gate, logger: { error: () => {} } })
  const key = writeKey(target.collection, target.id)
  const hookBlocks = [
    {
      type: 'heading',
      label: 'Heading',
      fields: [
        {
          name: 'text',
          type: 'text',
          hooks: { beforeChange: [({ value, context }: { value: unknown; context?: Record<string, unknown> }) => (context?.changeText && value === 'ORIGINAL' ? 'HOOKED' : value)] },
        },
      ],
    },
  ] as BlockDefinition[]
  let doc: Record<string, unknown> = { id: 'p1', layout: layoutWith('ORIGINAL') }
  /** The layout of every write, in order. */
  const writes: Layout[] = []
  const req = { payload: { logger: { info() {}, warn() {}, error() {} } }, t: (s: string) => s }
  const before = layoutBeforeChange({
    collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks: hookBlocks, css: { entry: 'does-not-exist.css' }, sessions,
    fieldRegistry: captureFieldSemantics(hookBlocks),
  }) as unknown as (args: unknown) => Promise<Record<string, unknown>>
  const after = layoutAfterChange({ collection: 'pages', sessions, writeGate: gate }) as unknown as (args: unknown) => Promise<unknown>
  let writing: Promise<void> | null = null
  const store: LiveDocStore = {
    async findByID() {
      return structuredClone(doc)
    },
    // The session's own save joins the gate it holds (the same `req`).
    update(args) {
      const { req: gateReq = {}, context: saveContext, data: input } = args as { req?: object; context?: Record<string, unknown>; data: Record<string, unknown> }
      return gate.run(key, gateReq, async () => {
        const context = { ...saveContext }
        const data = await before({ collection: { versions: { drafts: true } }, context, data: structuredClone(input), operation: 'update', originalDoc: structuredClone(doc), req })
        const wait = writing
        writing = null
        await wait
        doc = { ...doc, ...data }
        writes.push(structuredClone(doc.layout as Layout))
        await after({ context, doc })
        return structuredClone(doc)
      })
    },
  }
  /** A save from outside the session (the settings drawer, Publish, REST). `hold`: it waits after the guard ran. */
  const save = (data: Record<string, unknown>, options: { changeText?: boolean; publish?: boolean; hold?: Promise<void> } = {}) => {
    if (options.hold) writing = options.hold
    return store.update({ collection: target.collection, id: target.id, data, draft: !options.publish, context: options.changeText ? { changeText: true } : {} })
  }
  let saved: (() => void) | null = null
  const connect = () => sessions.connect({ target, store, clientId: 'a', user: ana, send: (event) => {
    if (event.type === 'saved') saved?.()
  } })
  const edit = (id: string, text: string, access?: CommitArgs['access']) =>
    sessions.commit({ target, store, user: ana, actor: actorFromUser(ana), blocks: hookBlocks, ops: [{ type: 'update', id, props: { text } }], ...(access ? { access } : {}) })
  /** An edit whose access check holds the session lock until `release`, and is refused. */
  const lockingEdit = (check: () => Promise<void>) => edit('h2', 'REFUSED', async () => {
    await check()
    return 'refused'
  })
  return {
    clock, gate, sessions, key, writes, save, connect, edit, lockingEdit,
    peek: () => sessions.peek(target.collection, target.id)!,
    nextSave: () => new Promise<void>((resolve) => { saved = resolve }),
    flush: () => sessions.flush(target.collection, target.id),
    get doc() { return doc },
  }
}

describe('hook changes of a guarded save and the saves after it', () => {
  it('Publish waits for the hook changes of the save before it, then publishes them', async () => {
    const h = hookedSetup()
    await h.connect()
    const access = hold()
    const editing = h.lockingEdit(() => access.promise)
    await settle()
    await h.save({ title: 'First save' }, { changeText: true })
    assert.deepEqual(h.doc.layout, layoutWith('HOOKED'), 'the first save stored the hook result')
    // Publish: it saves the session first, then publishes what the session holds.
    let flushed = false
    const publishing = h.flush().then(async (result) => {
      flushed = true
      await h.save({ _status: 'published' }, { publish: true })
      return result
    })
    await settle()
    assert.equal(flushed, false, 'Publish waits for the hook changes')
    assert.equal(h.peek().adopting, true)
    access.release()
    assert.equal((await editing).ok, false)
    assert.deepEqual(await publishing, { ok: true })
    assert.deepEqual(h.doc.layout, layoutWith('HOOKED'), 'Publish keeps the hook result')
    assert.deepEqual(h.peek().layout, layoutWith('HOOKED'))
    assert.equal(h.peek().adopting, undefined)
    assert.equal(h.sessions.unsaved(), 0)
    assert.deepEqual(await h.flush(), { ok: true })
    assert.deepEqual(h.writes, [layoutWith('HOOKED'), layoutWith('HOOKED')])
  })

  it('refuses two following saves while the hook changes wait, and stores them after', async () => {
    const h = hookedSetup()
    await h.connect()
    const access = hold()
    const editing = h.lockingEdit(() => access.promise)
    await settle()
    await h.save({ title: 'First save' }, { changeText: true })
    const drawer = await outcome(h.save({ title: 'Second save' }))
    const publish = await outcome(h.save({ _status: 'published' }, { publish: true }))
    assert.equal(drawer.error?.status, 409)
    assert.equal(publish.error?.status, 409)
    assert.deepEqual(h.doc.layout, layoutWith('HOOKED'), 'no later save wrote over the hook result')
    access.release()
    assert.equal((await editing).ok, false)
    await settle()
    // Both saves work again once the session holds the hook changes.
    await h.save({ title: 'Second save' })
    await h.save({ _status: 'published' }, { publish: true })
    assert.deepEqual(h.doc.layout, layoutWith('HOOKED'))
    assert.equal(h.doc.title, 'Second save')
    assert.deepEqual(h.peek().layout, layoutWith('HOOKED'))
    assert.equal(h.sessions.unsaved(), 0)
    assert.deepEqual(await h.flush(), { ok: true })
  })

  for (const how of ['flush', 'autosave'] as const) {
    it(`never saves the session without the queued hook changes (${how})`, { timeout: 10_000 }, async () => {
      const h = hookedSetup()
      await h.connect()
      // The first save read the session before the edit below, and commits after it.
      const writing = hold()
      const first = h.save({ title: 'First save' }, { changeText: true, hold: writing.promise })
      await settle()
      assert.equal((await h.edit('h2', 'EDITED')).ok, true)
      const access = hold()
      const editing = h.lockingEdit(() => access.promise)
      await settle()
      writing.release()
      await first
      assert.deepEqual(h.doc.layout, layoutWith('HOOKED', 'B'))
      assert.equal(h.sessions.unsaved(), 1, 'the edit is not saved yet')
      let flushing: Promise<unknown> | null = null
      if (how === 'flush') flushing = h.flush()
      else await h.clock.advance(10_000)
      await settle()
      assert.deepEqual(h.writes, [layoutWith('HOOKED', 'B')], 'no session save while the hook changes wait')
      access.release()
      assert.equal((await editing).ok, false)
      if (flushing) assert.deepEqual(await flushing, { ok: true })
      else {
        await settle()
        const saved = h.nextSave()
        await h.clock.advance(10_000)
        await saved
      }
      const expected = layoutWith('HOOKED', 'EDITED')
      assert.deepEqual(h.writes, [layoutWith('HOOKED', 'B'), expected])
      assert.deepEqual(h.doc.layout, expected)
      assert.deepEqual(h.peek().layout, expected)
      assert.equal(h.sessions.unsaved(), 0)
    })
  }

  it('does not deadlock when the access check of the edit that holds the session lock needs the write gate', async () => {
    const h = hookedSetup()
    await h.connect()
    const writing = hold()
    const first = h.save({ title: 'First save' }, { changeText: true, hold: writing.promise })
    await settle()
    assert.equal((await h.edit('h2', 'EDITED')).ok, true)
    const access = hold()
    // The access check needs the write gate (for example a save of its own) after it waited.
    const editing = h.lockingEdit(async () => {
      await access.promise
      await h.gate.run(h.key, {}, async () => {})
    })
    await settle()
    writing.release()
    await first
    assert.equal(h.sessions.unsaved(), 1)
    const flushing = h.flush()
    // The queued autosave and a following save meet the waiting hook changes under the write gate.
    await h.clock.advance(10_000)
    const drawer = await outcome(h.save({ title: 'Second save' }))
    assert.equal(drawer.error?.status, 409)
    assert.deepEqual(h.writes, [layoutWith('HOOKED', 'B')])
    access.release()
    assert.equal((await editing).ok, false)
    assert.deepEqual(await flushing, { ok: true })
    const expected = layoutWith('HOOKED', 'EDITED')
    assert.deepEqual(h.writes, [layoutWith('HOOKED', 'B'), expected])
    assert.deepEqual(h.doc.layout, expected)
    assert.deepEqual(h.peek().layout, expected)
    assert.equal(h.sessions.unsaved(), 0)
  })
})

/** A document whose stored layout outside saves change, by id (through the write gate) or by `where` (not gated). */
function outsideSetup(codec: LayoutCodec) {
  const clock = fakeTimers()
  const gate = createWriteGate()
  const sessions = createSessionManager({ timers: clock.timers, gate, logger: { error: () => {} } })
  const codecTarget = { ...target, codec }
  let doc: Record<string, unknown> = { id: 'p1', layout: codec.encode(headingLayout('ORIGINAL')) }
  let writes = 0
  let next: { started: () => void; held: Promise<void>; fail: boolean } | null = null
  const store: LiveDocStore = {
    async findByID() {
      // The read sees the document as it is when the read starts.
      const snapshot = structuredClone(doc)
      const step = next
      next = null
      if (step) {
        step.started()
        await step.held
        if (step.fail) throw new Error('Outside read failed')
      }
      return snapshot
    },
    async update(args) {
      writes += 1
      doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>) }
      return structuredClone(doc)
    },
  }
  /** Holds the next read of the document; `fail`: it fails when released. */
  const holdNextRead = (fail = false) => {
    const held = hold()
    const read = { started: false, release: held.release }
    next = { started: () => { read.started = true }, held: held.promise, fail }
    return read
  }
  const key = writeKey(target.collection, target.id)
  const store_ = (value: Layout) => {
    doc = { ...doc, layout: codec.encode(value) }
    sessions.externalSaved(target.collection, target.id, { layoutChanged: true })
  }
  /** A save by id: through the write gate. `then` runs while it still holds the gate. */
  const savedById = (value: Layout, then?: () => void) => gate.run(key, {}, async () => {
    store_(value)
    then?.()
  })
  /** A bulk update (`where`): the write gate covers updates by id only. */
  const savedByWhere = (value: Layout) => store_(value)
  const connect = () => sessions.connect({ target: codecTarget, store, clientId: 'a', user: ana, send: () => {} })
  const edit = (text: string) =>
    sessions.commit({ target: codecTarget, store, user: ana, actor: actorFromUser(ana), blocks, ops: [{ type: 'update', id: 'h1', props: { text } }] })
  return {
    clock, sessions, store, holdNextRead, savedById, savedByWhere, connect, edit,
    peek: () => sessions.peek(target.collection, target.id)!,
    flush: () => sessions.flush(target.collection, target.id),
    get doc() { return doc },
    get writes() { return writes },
  }
}

/** The heading h1 with `text`, and one more heading per outside save. */
const withRows = (text: string, ...extra: string[]): Layout => ({ version: 1, blocks: [heading('h1', text), ...extra.map((id) => heading(id, id.toUpperCase()))] })

describe('outside saves during a read of the stored layout', () => {
  for (const codec of [JSON_CODEC, payloadBlocksCodec({ blocks, rootTypes: ['heading'] })]) {
    it(`${codec.kind}: keeps a bulk update that lands during the read of an earlier outside save`, async () => {
      const h = outsideSetup(codec)
      await h.connect()
      let read!: ReturnType<typeof h.holdNextRead>
      await h.savedById(withRows('S1'), () => {
        read = h.holdNextRead()
      })
      await settle()
      assert.equal(read.started, true)
      h.savedByWhere(withRows('S1', 'bulk'))
      read.release()
      await settle()
      assert.equal((await h.edit('EDIT')).ok, true)
      assert.deepEqual(await h.flush(), { ok: true })
      assert.deepEqual(h.peek().layout, withRows('EDIT', 'bulk'))
      assert.deepEqual(h.doc.layout, codec.encode(withRows('EDIT', 'bulk')), 'the committed bulk row survives')
      assert.equal(h.writes, 1)
      assert.equal(h.sessions.unsaved(), 0)
    })

    for (const count of [2, 3]) {
      it(`${codec.kind}: takes the newest of ${count} outside saves that each land during the read of the one before`, async () => {
        const h = outsideSetup(codec)
        await h.connect()
        assert.equal((await h.edit('EDIT')).ok, true)
        const rows: string[] = []
        let read!: ReturnType<typeof h.holdNextRead>
        await h.savedById(withRows('S1'), () => {
          read = h.holdNextRead()
        })
        for (let i = 2; i <= count; i++) {
          await settle()
          assert.equal(read.started, true, `the read after outside save ${i - 1} runs`)
          rows.push(`u${i}`)
          h.savedByWhere(withRows('S1', ...rows))
          const older = read
          // The next read (for the newer save) is held too, except for the last.
          if (i < count) read = h.holdNextRead()
          older.release()
        }
        await settle()
        assert.deepEqual(h.peek().layout, withRows('EDIT', ...rows), 'the session shows the newest stored layout')
        assert.deepEqual(await h.flush(), { ok: true })
        assert.deepEqual(h.doc.layout, codec.encode(withRows('EDIT', ...rows)))
        assert.equal(h.writes, 1)
        assert.equal(h.sessions.unsaved(), 0)
      })
    }

    it(`${codec.kind}: retries a failed outside read and never saves on a read that a newer outside save overtook`, async () => {
      const h = outsideSetup(codec)
      await h.connect()
      assert.equal((await h.edit('EDIT')).ok, true)
      let failing!: ReturnType<typeof h.holdNextRead>
      await h.savedById(withRows('S1'), () => {
        failing = h.holdNextRead(true)
      })
      await settle()
      assert.equal(failing.started, true)
      failing.release()
      await settle()
      assert.equal(h.sessions.unsaved(), 1, 'the failed read keeps the outside save pending')
      // The session save reads first; a bulk update lands during that read.
      const read = h.holdNextRead()
      await h.clock.advance(1000)
      assert.equal(read.started, true, 'the save reads the outside save first')
      h.savedByWhere(withRows('S1', 'bulk'))
      read.release()
      await settle()
      assert.deepEqual(h.doc.layout, codec.encode(withRows('EDIT', 'bulk')), 'the save is based on the newest stored layout')
      assert.deepEqual(await h.flush(), { ok: true })
      assert.deepEqual(h.peek().layout, withRows('EDIT', 'bulk'))
      assert.deepEqual(h.doc.layout, codec.encode(withRows('EDIT', 'bulk')))
      assert.equal(h.writes, 1)
      assert.equal(h.sessions.unsaved(), 0)
    })

    it(`${codec.kind}: a save whose every read is overtaken writes nothing, and its retry saves on the newest layout`, async () => {
      const h = outsideSetup(codec)
      await h.connect()
      assert.equal((await h.edit('EDIT')).ok, true)
      let failing!: ReturnType<typeof h.holdNextRead>
      await h.savedById(withRows('S1'), () => {
        failing = h.holdNextRead(true)
      })
      await settle()
      failing.release()
      await settle()
      let read = h.holdNextRead()
      await h.clock.advance(1000)
      const rows: string[] = []
      for (let i = 1; i <= 3; i++) {
        assert.equal(read.started, true, `read ${i} of the save runs`)
        rows.push(`u${i}`)
        h.savedByWhere(withRows('S1', ...rows))
        const older = read
        if (i < 3) read = h.holdNextRead()
        older.release()
        await settle()
      }
      assert.equal(h.writes, 0, 'no write on a read that a newer outside save overtook')
      assert.deepEqual(h.doc.layout, codec.encode(withRows('S1', ...rows)))
      assert.deepEqual(h.peek().layout, withRows('EDIT', ...rows), 'the queued outside sync takes the newest layout')
      assert.equal(h.sessions.unsaved(), 1)
      await h.clock.advance(2000)
      assert.deepEqual(h.doc.layout, codec.encode(withRows('EDIT', ...rows)))
      assert.equal(h.writes, 1)
      assert.equal(h.sessions.unsaved(), 0)
    })
  }
})

const insertAt = (id: string, index = 0) => ({ type: 'insert', block: heading(id), to: { parentId: null, slot: 'children', index } })
const commitsOf = (events: MultiplayerEvent[]) => events.filter((e): e is LiveCommitEvent => e.type === 'commit')

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe('document session', () => {
  it('sends the full session first, with self and every collaborator', async () => {
    const { connect } = setup()
    const a = await connect('tab-a')
    const first = a.events[0] as LiveSessionEvent
    assert.equal(first.type, 'session')
    assert.equal(first.seq, 0)
    assert.deepEqual(first.layout, base)
    assert.equal(first.self.clientId, 'tab-a')
    assert.equal(first.self.name, 'Ana')
    assert.equal(a.ids[0], `${first.sessionId}:0`)

    const b = await connect('tab-b', bob)
    const second = b.events[0] as LiveSessionEvent
    assert.deepEqual(second.collaborators.map((c) => [c.clientId, c.name, c.awareness]), [
      ['tab-a', 'Ana', null],
      ['tab-b', 'bob', null],
    ])
    // A learns that B joined.
    const joined = a.events.at(-1)
    assert.ok(joined?.type === 'collaborators' && joined.collaborators.length === 2)
    b.connection.leave()
    const left = a.events.at(-1)
    assert.ok(left?.type === 'collaborators' && left.collaborators.length === 1)
  })

  it('applies concurrent commits in arrival order with seq rising by 1', async () => {
    const clock = fakeTimers()
    const sessions = createSessionManager({ timers: clock.timers })
    const db = fakeStore(base, { read: 15 })
    const events: MultiplayerEvent[] = []
    const run = (id: string, clientId: string) =>
      sessions.commit({ target, store: db.store, user: ana, actor: actorFromUser(ana), ops: [insertAt(id)], blocks, clientId, batchId: id })
    const connecting = sessions.connect({ target, store: db.store, clientId: 'watch', user: bob, send: (e) => events.push(e) })
    const results = await Promise.all([run('x1', 'a'), run('x2', 'b'), run('x3', 'a')])
    await connecting
    assert.deepEqual(results.map((r) => r.ok && r.seq), [1, 2, 3])
    assert.deepEqual(sessions.peek('pages', 'p1')?.layout.blocks.map((b) => b.id), ['x3', 'x2', 'x1', 's1'])
    // The sender's echo carries its clientId and batchId: that is its acknowledgement.
    const commits = commitsOf(events)
    assert.deepEqual(commits.map((c) => [c.seq, c.clientId, c.batchId]), [
      [1, 'a', 'x1'],
      [2, 'b', 'x2'],
      [3, 'a', 'x3'],
    ])
  })

  it('rejects operations that no longer apply, without a broadcast', async () => {
    const { connect, commit } = setup()
    const a = await connect('tab-a')
    const removed = await commit([{ type: 'remove', id: 'h1' }], { clientId: 'tab-a', batchId: '1', baseSeq: 0 })
    assert.ok(removed.ok)
    const stale = await commit([{ type: 'update', id: 'h1', props: { text: 'Late' } }], { clientId: 'tab-b', batchId: '1', baseSeq: 0 })
    assert.equal(stale.ok, false)
    assert.equal(stale.seq, 1)
    if (!stale.ok) assert.match(stale.error, /not found/)
    assert.equal(commitsOf(a.events).length, 1)
  })

  it('rejects a baseSeq from the future (restarted session)', async () => {
    const { commit } = setup()
    const result = await commit([insertAt('x')], { baseSeq: 7 })
    assert.equal(result.ok, false)
    assert.equal(result.seq, 0)
  })

  it('rejects an invalid result but allows unfinished blocks as warnings', async () => {
    const { commit, sessions } = setup()
    const bad = await commit([{ type: 'insert', block: { id: 'z', type: 'nope' }, to: { parentId: null, slot: 'children', index: 0 } }])
    assert.equal(bad.ok, false)
    if (!bad.ok) assert.ok(bad.errors && bad.errors.length > 0)
    const unfinished = await commit([{ type: 'insert', block: { id: 'z', type: 'heading' }, to: { parentId: null, slot: 'children', index: 0 } }])
    assert.ok(unfinished.ok)
    if (unfinished.ok) assert.equal(unfinished.warnings[0]?.code, 'required')
    assert.equal(sessions.peek('pages', 'p1')?.seq, 1)
  })

  it('does not let blocking problems already in the stored layout block new commits', async () => {
    const broken: Layout = { version: 1, blocks: [{ id: 'old', type: 'retired-block' }] }
    const { commit } = setup({}, broken)
    const result = await commit([insertAt('x')])
    assert.ok(result.ok)
  })

  it('broadcasts a duplicate as the insert of the finished copy', async () => {
    const { connect, commit, sessions } = setup()
    const a = await connect('tab-a')
    const result = await commit([{ type: 'duplicate', id: 's1', newId: 's2' }])
    assert.ok(result.ok)
    const [event] = commitsOf(a.events)
    assert.equal(event.ops[0].type, 'insert')
    const replayed = applyOperations(base, event.ops)
    assert.ok(replayed.ok)
    assert.deepEqual(replayed.layout, sessions.peek('pages', 'p1')?.layout)
  })

  it('builds operations from the session layout when given a function', async () => {
    const { sessions, db } = setup()
    const result = await sessions.commit({
      target,
      store: db.store,
      user: ana,
      actor: ai,
      blocks,
      ops: (layout) => [{ type: 'remove', id: layout.blocks[0].id }],
    })
    assert.ok(result.ok)
    assert.deepEqual(sessions.peek('pages', 'p1')?.layout.blocks, [])
  })

  it('saves the draft 1 s after the last commit, as the last committer', async () => {
    const { commit, clock, db } = setup()
    await commit([insertAt('x1')])
    await clock.advance(500)
    await commit([insertAt('x2')], { user: bob })
    await clock.advance(900)
    assert.equal(db.writes.length, 0)
    await clock.advance(100)
    assert.equal(db.writes.length, 1)
    const write = db.writes[0]
    assert.equal(write.draft, true)
    assert.equal(write.autosave, true)
    assert.equal(write.overrideAccess, false)
    assert.deepEqual(write.context, { builderSession: true })
    assert.deepEqual(write.user, bob)
    assert.deepEqual((write.data as { layout: Layout }).layout.blocks.map((b) => b.id), ['x2', 'x1', 's1'])
  })

  it('saves at least every 5 s while commits keep coming', async () => {
    const { commit, clock, db } = setup()
    for (let i = 0; i < 12; i++) {
      await commit([insertAt(`x${i}`)])
      await clock.advance(500)
    }
    // Commits at 0..5500 ms, never 1 s apart: the max wait forces a save at 5 s.
    assert.equal(db.writes.length, 1)
    await clock.advance(1000)
    assert.equal(db.writes.length, 2)
    assert.equal((db.doc.layout as Layout).blocks.length, 13)
  })

  it('retries a failed save with backoff, tells the editors, and reports the save that works', async () => {
    const { connect, commit, clock, db, errors } = setup()
    const a = await connect('tab-a')
    db.failNext(3, () => Object.assign(new Error('Validation failed'), { status: 400, data: { errors: [{ message: 'Title is required' }] } }))
    await commit([insertAt('x1')])
    await clock.advance(1000) // try 1 fails
    const failed = a.events.filter((e): e is LiveSaveFailedEvent => e.type === 'saveFailed')
    assert.equal(failed.length, 1)
    assert.equal(failed[0].message, 'Title is required')
    assert.equal(failed[0].retrying, true)
    await clock.advance(1999)
    assert.equal(errors.length, 1)
    await clock.advance(1) // try 2 after 2 s
    assert.equal(errors.length, 2)
    await clock.advance(5000) // try 3 after 5 s
    assert.equal(errors.length, 3)
    assert.equal(db.writes.length, 0)
    await clock.advance(14_999)
    assert.equal(db.writes.length, 0)
    await clock.advance(1) // try 4 after 15 s works
    assert.equal(db.writes.length, 1)
    assert.equal(a.events.filter((e) => e.type === 'saveFailed').length, 3)
    assert.equal(a.events.at(-1)?.type, 'saved')
    // Nothing more to save: no more tries.
    await clock.advance(120_000)
    assert.equal(db.writes.length, 1)
    assert.equal(errors.length, 3)
  })

  it('keeps retrying every 30 s while the commits are unsaved', async () => {
    const { commit, clock, db, errors } = setup()
    db.failNext(100)
    await commit([insertAt('x1')])
    await clock.advance(1000 + 2000 + 5000 + 15_000) // tries 1-4
    assert.equal(errors.length, 4)
    await clock.advance(30_000)
    assert.equal(errors.length, 5)
    await clock.advance(30_000)
    assert.equal(errors.length, 6)
    // New commits do not reset the backoff (no burst of saves against a broken database).
    await commit([insertAt('x2')])
    await clock.advance(29_000)
    assert.equal(errors.length, 6)
    db.failNext(0)
    await clock.advance(1000)
    assert.equal(db.writes.length, 1)
    assert.deepEqual((db.writes[0].data as { layout: Layout }).layout.blocks.map((b) => b.id), ['x2', 'x1', 's1'])
  })

  it('sends the last save error to an editor that connects while saves fail', async () => {
    const { connect, commit, clock, db } = setup()
    db.failNext(100)
    await commit([insertAt('x1')])
    await clock.advance(1000)
    const b = await connect('tab-b')
    assert.deepEqual(
      b.events.map((e) => e.type),
      ['session', 'saveFailed'],
    )
  })

  it('flush saves at once during a retry wait and returns the failure reason', async () => {
    const { connect, commit, clock, db, sessions } = setup()
    const a = await connect('tab-a')
    db.failNext(2)
    await commit([insertAt('x1')])
    await clock.advance(1000) // try 1 fails, the next try waits 2 s
    const failed = await sessions.flush('pages', 'p1')
    assert.deepEqual(failed, { ok: false, error: 'DB down' })
    const saved = await sessions.flush('pages', 'p1')
    assert.deepEqual(saved, { ok: true })
    assert.equal(db.writes.length, 1)
    assert.equal(a.events.at(-1)?.type, 'saved')
    // The retry timer is gone with the error.
    await clock.advance(60_000)
    assert.equal(db.writes.length, 1)
  })

  it('does not retry a save the user may not make, until the next commit', async () => {
    const { connect, commit, clock, db, errors } = setup()
    const a = await connect('tab-a')
    db.failNext(1, () => Object.assign(new Error('Forbidden'), { status: 403 }))
    await commit([insertAt('x1')])
    await clock.advance(1000)
    const failed = a.events.find((e): e is LiveSaveFailedEvent => e.type === 'saveFailed')
    assert.equal(failed?.retrying, false)
    await clock.advance(120_000)
    assert.equal(errors.length, 1)
    await commit([insertAt('x2')])
    await clock.advance(1000)
    assert.equal(db.writes.length, 1)
  })

  it('counts sessions with unsaved commits', async () => {
    const { commit, clock, sessions } = setup()
    assert.equal(sessions.unsaved(), 0)
    await commit([insertAt('x')])
    assert.equal(sessions.unsaved(), 1)
    await sessions.flushAll()
    assert.equal(sessions.unsaved(), 0)
    await clock.advance(1000)
  })

  it('drops an idle, saved session 60 s after the last connection leaves', async () => {
    const { connect, commit, clock, sessions } = setup()
    const a = await connect('tab-a')
    await commit([insertAt('x')])
    a.connection.leave()
    await clock.advance(1000) // saved
    assert.equal(sessions.size(), 1)
    await clock.advance(59_000)
    assert.equal(sessions.size(), 1)
    await clock.advance(1000)
    assert.equal(sessions.size(), 0)
  })

  it('keeps a session alive while someone connects again', async () => {
    const { connect, clock, sessions } = setup()
    const a = await connect('tab-a')
    a.connection.leave()
    await clock.advance(30_000)
    await connect('tab-a')
    await clock.advance(120_000)
    assert.equal(sessions.size(), 1)
  })

  it('replays missed commits after a reconnect, else sends a fresh session', async () => {
    const { connect, commit } = setup({ logSize: 2 })
    const a = await connect('tab-a')
    const { sessionId } = a.events[0] as LiveSessionEvent
    a.connection.leave()
    await commit([insertAt('x1')])
    await commit([insertAt('x2')])

    const resumed = await connect('tab-a', ana, { seq: 1, sessionId })
    assert.deepEqual(resumed.events.map((e) => e.type), ['commit', 'collaborators'])
    assert.equal((resumed.events[0] as LiveCommitEvent).seq, 2)
    assert.equal(resumed.ids[0], `${sessionId}:2`)
    assert.equal(resumed.connection.replayed, true)

    // Older than the log, from another session, or from the future: a fresh session event.
    await commit([insertAt('x3')])
    for (const after of [{ seq: 0, sessionId }, { seq: 3, sessionId: 'other' }, { seq: 9, sessionId }]) {
      const fresh = await connect('tab-c', bob, after)
      assert.equal(fresh.events[0].type, 'session', JSON.stringify(after))
      fresh.connection.leave()
    }
  })

  it('relays awareness to the others only, and only for connected clients', async () => {
    const { connect, sessions } = setup()
    const a = await connect('tab-a')
    const b = await connect('tab-b', bob)
    const before = b.events.length
    const awareness = { selectedId: 'h1', hoveredId: null, cursor: { blockId: 'h1', x: 0.5, y: 0.25 }, canvasWidth: 1280, extra: 'x' }
    assert.equal(sessions.awareness('pages', 'p1', 'tab-a', awareness, 'user:1'), true)
    const relayed = b.events.at(-1)
    assert.deepEqual(relayed, {
      type: 'awareness',
      clientId: 'tab-a',
      awareness: { selectedId: 'h1', hoveredId: null, cursor: { blockId: 'h1', x: 0.5, y: 0.25 }, canvasWidth: 1280 },
    })
    assert.equal(b.events.length, before + 1)
    assert.ok(!a.events.some((e) => e.type === 'awareness'))
    // Someone else's connection, an unknown client, junk.
    assert.equal(sessions.awareness('pages', 'p1', 'tab-a', awareness, 'user:2'), false)
    assert.equal(sessions.awareness('pages', 'p1', 'nobody', awareness), false)
    assert.equal(sessions.awareness('pages', 'p1', 'tab-a', 'junk'), false)
    // A later connection gets the awareness in its session event.
    const c = await connect('tab-c', bob)
    const state = (c.events[0] as LiveSessionEvent).collaborators.find((m) => m.clientId === 'tab-a')
    assert.equal(state?.awareness?.selectedId, 'h1')
  })

  it('names each collaborator by user id, so two tabs of one person can be told apart', async () => {
    const { connect } = setup()
    await connect('tab-a')
    const b = await connect('tab-b', bob)
    const second = b.events[0] as LiveSessionEvent
    const ids = second.collaborators.map((c) => c.userId)
    assert.equal(ids.length, 2)
    assert.notEqual(ids[0], ids[1])
    assert.equal(second.self.userId, ids[1])
  })

  it('drops a closing tab at once, only for its owner', async () => {
    const { connect, sessions } = setup()
    const a = await connect('tab-a')
    await connect('tab-b', bob)
    assert.equal(sessions.disconnect('pages', 'p1', 'tab-b', 'user:1'), false, 'not your tab')
    assert.equal(sessions.disconnect('pages', 'p1', 'tab-b'), true)
    const left = a.events.at(-1)
    assert.ok(left?.type === 'collaborators' && left.collaborators.length === 1)
    assert.equal(sessions.disconnect('pages', 'p1', 'tab-b'), false, 'already gone')
  })

  it('shows an AI as a collaborator while it edits, then lets it leave', async () => {
    const { connect, commit, clock } = setup({ aiIdleMs: 30_000 })
    const a = await connect('tab-a')
    await commit([{ type: 'update', id: 'h1', props: { text: 'AI' } }], { actor: ai })
    const types = a.events.map((e) => e.type)
    assert.deepEqual(types.slice(1), ['collaborators', 'commit', 'awareness'])
    const pointer = a.events[3]
    assert.ok(pointer.type === 'awareness' && pointer.clientId === 'ai:mcp-key:1' && pointer.awareness.selectedId === 'h1')
    await clock.advance(30_000)
    const left = a.events.at(-1)
    assert.ok(left?.type === 'collaborators' && left.collaborators.every((c) => c.type === 'user'))
  })
})

describe('collaborator identity', () => {
  it('gives each user a stable color from the palette', () => {
    assert.equal(collaboratorColor('user:1'), collaboratorColor('user:1'))
    assert.ok((COLLABORATOR_COLORS as readonly string[]).includes(collaboratorColor('user:1')))
    const colors = new Set(Array.from({ length: 50 }, (_, i) => collaboratorColor(`user:${i}`)))
    assert.ok(colors.size >= 8)
  })

  it('names people by name, else the local part of the email', () => {
    assert.equal(collaboratorName({ name: ' Ana ' }), 'Ana')
    assert.equal(collaboratorName({ email: 'bob@x.test' }), 'bob')
    assert.equal(collaboratorName(null), 'Someone')
    assert.deepEqual(requestActor(bob), { type: 'user', id: 'user:2', label: 'bob' })
  })

  it('sanitizes awareness', () => {
    assert.equal(sanitizeAwareness(null), null)
    assert.deepEqual(sanitizeAwareness({ cursor: { x: 'a', y: 1 }, canvasWidth: -1, selectedId: 3 }), {
      selectedId: null,
      hoveredId: null,
      cursor: null,
      canvasWidth: null,
    })
  })
})

// ---------------------------------------------------------------------------
// Save-hook guard
// ---------------------------------------------------------------------------

describe('save-hook guard', () => {
  const css = { entry: 'does-not-exist.css' }
  const req = { payload: { logger: { warn() {}, error() {} } }, t: (s: string) => s }
  const collection = { versions: { drafts: true } }

  it('replaces the layout of an outside save with the session layout, and lets session saves through', async () => {
    const { sessions, commit, clock, db } = setup()
    const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, sessions })
    const after = layoutAfterChange({ collection: 'pages', sessions })
    await commit([{ type: 'update', id: 'h1', props: { text: 'Live' } }])

    const stale = { layout: structuredClone(base), title: 'T' }
    const context: Record<string, unknown> = {}
    const call = (data: Record<string, unknown>, ctx: Record<string, unknown>) =>
      (hook as unknown as (args: unknown) => Promise<Record<string, unknown>>)({
        collection,
        context: ctx,
        data,
        operation: 'update',
        originalDoc: { id: 'p1', _status: 'draft' },
        req,
      })
    const guarded = await call(stale, context)
    assert.equal(findBlock(guarded.layout as Layout, 'h1')?.props?.text, 'Live')
    assert.equal(guarded.title, 'T')

    // Publish without the layout in the data also gets the session layout.
    const publish = await call({ _status: 'published' }, {})
    assert.equal(findBlock(publish.layout as Layout, 'h1')?.props?.text, 'Live')

    const own = await call({ layout: structuredClone(base) }, { builderSession: true })
    assert.equal(findBlock(own.layout as Layout, 'h1')?.props?.text, 'Hi')

    // The guarded save stored the session state: the session does not save it again.
    ;(after as unknown as (args: unknown) => unknown)({ context, doc: { id: 'p1' } })
    await clock.advance(10_000)
    assert.equal(db.writes.length, 0)
  })

  it('leaves saves alone when no session is open', async () => {
    const { sessions } = setup()
    const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css, sessions })
    const data = await (hook as unknown as (args: unknown) => Promise<Record<string, unknown>>)({
      collection,
      context: {},
      data: { layout: structuredClone(base) },
      operation: 'update',
      originalDoc: { id: 'p1' },
      req,
    })
    assert.equal(findBlock(data.layout as Layout, 'h1')?.props?.text, 'Hi')
  })
})

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

/** Reads frames from an SSE stream until `count` frames arrived. */
async function readFrames(stream: ReadableStream<Uint8Array>, count: number): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const frames: string[] = []
  while (frames.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    let end
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      frames.push(buffer.slice(0, end))
      buffer = buffer.slice(end + 2)
    }
  }
  await reader.cancel()
  return frames
}

describe('sessionStream', () => {
  it('formats frames as one JSON data line', () => {
    assert.equal(sseFrame('commit', { a: 1 }, 's:1'), 'id: s:1\nevent: commit\ndata: {"a":1}\n\n')
    assert.equal(sseFrame('awareness', { a: 'x\ny' }), 'event: awareness\ndata: {"a":"x\\ny"}\n\n')
  })

  it('sends the session, then live commits, and leaves on cancel', async () => {
    const { sessions, db, commit } = setup()
    const stream = sessionStream({
      heartbeatMs: 60_000,
      connect: (send, close) => sessions.connect({ target, store: db.store, clientId: 'tab-a', user: ana, send, close }),
    })
    const reading = readFrames(stream, 3)
    await delay(10)
    await commit([insertAt('x')], { clientId: 'tab-b', batchId: 'b1' })
    const frames = await reading
    assert.equal(frames[0], 'retry: 3000')
    assert.match(frames[1], /^id: [0-9a-f]{8}:0\nevent: session\n/)
    assert.match(frames[2], /^id: [0-9a-f]{8}:1\nevent: commit\n/)
    await delay(0)
    const probe: MultiplayerEvent[] = []
    await sessions.connect({ target, store: db.store, clientId: 'probe', user: bob, send: (e) => probe.push(e) })
    const state = probe[0] as LiveSessionEvent
    assert.deepEqual(state.collaborators.map((c) => c.clientId), ['probe'])
  })

  it('sends an error frame when the document cannot load', async () => {
    const { sessions, db } = setup()
    const stream = sessionStream({
      heartbeatMs: 60_000,
      connect: (send) => sessions.connect({ target: { ...target, id: 'missing' }, store: db.store, clientId: 'a', user: ana, send }),
    })
    const frames = await readFrames(stream, 3)
    assert.match(frames[1], /^event: error\n/)
  })

  it('ends the stream and leaves when the reader stops reading', async () => {
    const { sessions, db } = setup()
    const stream = sessionStream({
      heartbeatMs: 5,
      connect: (send, close) => sessions.connect({ target, store: db.store, clientId: 'gone', user: ana, send, close }),
    })
    // Read nothing: the queue fills, and the stream gives up after an interval without reads.
    stream.getReader()
    await delay(60)
    assert.equal(sessions.peek('pages', 'p1') !== null, true)
    const probe: MultiplayerEvent[] = []
    await sessions.connect({ target, store: db.store, clientId: 'probe', user: bob, send: (e) => probe.push(e) })
    assert.deepEqual((probe[0] as LiveSessionEvent).collaborators.map((c) => c.clientId), ['probe'])
  })

  it('replaces the connection when the same clientId connects again', async () => {
    const { sessions, db } = setup()
    let closed = 0
    const first: MultiplayerEvent[] = []
    await sessions.connect({ target, store: db.store, clientId: 'tab', user: ana, send: (e) => first.push(e), close: () => closed++ })
    const second: MultiplayerEvent[] = []
    const again = await sessions.connect({ target, store: db.store, clientId: 'tab', user: ana, send: (e) => second.push(e) })
    assert.equal(closed, 1)
    assert.deepEqual((second[0] as LiveSessionEvent).collaborators.map((c) => c.clientId), ['tab'])
    again.leave()
    assert.equal(sessions.peek('pages', 'p1') !== null, true)
  })

  it('sends heartbeats', async () => {
    const { sessions, db } = setup()
    const stream = sessionStream({
      heartbeatMs: 5,
      connect: (send) => sessions.connect({ target, store: db.store, clientId: 'a', user: ana, send }),
    })
    const frames = await readFrames(stream, 4)
    assert.equal(frames[3], ': ping')
  })
})

// ---------------------------------------------------------------------------
// Helpers kept from the single-editor channel
// ---------------------------------------------------------------------------

describe('keyed mutex', () => {
  it('runs tasks for one key in call order, never overlapping', async () => {
    const mutex = createKeyedMutex()
    const log: string[] = []
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`)
      await delay(ms)
      log.push(`end ${name}`)
      return name
    }
    const results = await Promise.all([mutex.run('k', task('a', 20)), mutex.run('k', task('b', 1)), mutex.run('k', task('c', 5))])
    assert.deepEqual(results, ['a', 'b', 'c'])
    assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
    assert.equal(mutex.size(), 0)
  })

  it('keeps going after a failed task', async () => {
    const mutex = createKeyedMutex()
    const failed = mutex.run('k', async () => {
      throw new Error('boom')
    })
    const next = mutex.run('k', async () => 'ok')
    await assert.rejects(failed, /boom/)
    assert.equal(await next, 'ok')
  })

  it('runs different keys in parallel', async () => {
    const mutex = createKeyedMutex()
    const log: string[] = []
    await Promise.all([
      mutex.run('a', async () => {
        await delay(20)
        log.push('a')
      }),
      mutex.run('b', async () => {
        log.push('b')
      }),
    ])
    assert.deepEqual(log, ['b', 'a'])
  })
})

describe('resolveOperations', () => {
  it('turns a duplicate into the insert of the finished copy', () => {
    const result = resolveOperations(base, [{ type: 'duplicate', id: 's1', newId: 's2' }])
    assert.ok(result.ok)
    assert.equal(result.ops.length, 1)
    const [op] = result.ops
    assert.equal(op.type, 'insert')
    if (op.type !== 'insert') return
    assert.deepEqual(op.to, { parentId: null, slot: 'children', index: 1 })
    assert.equal(op.block.id, 's2')
    const childId = op.block.slots?.children[0].id
    assert.ok(childId && childId !== 'h1')
    // Every client applying the broadcast insert ends with the server's layout, ids included.
    const replayed = applyOperations(base, result.ops)
    assert.ok(replayed.ok)
    assert.deepEqual(replayed.layout, result.layout)
  })

  it('is all or nothing and names the failing operation', () => {
    const result = resolveOperations(base, [
      { type: 'update', id: 'h1', props: { text: 'Changed' } },
      { type: 'remove', id: 'missing' },
    ])
    assert.deepEqual(result, { ok: false, error: 'Operation 1 (remove): Block "missing" not found' })
    assert.equal(resolveOperations(base, []).ok, false)
    assert.equal(resolveOperations(base, 'nope').ok, false)
  })
})

describe('actorFromUser', () => {
  it('marks API-key users as AI agents', () => {
    assert.deepEqual(actorFromUser({ id: 3, name: 'Ana', email: 'ana@x.test' }), { type: 'user', id: 'user:3', label: 'Ana' })
    assert.deepEqual(actorFromUser({ id: 3, email: 'ana@x.test' }), { type: 'user', id: 'user:3', label: 'ana@x.test' })
    assert.deepEqual(actorFromUser({ id: 3, email: 'ana@x.test', _mcpKey: { keyId: 9 } }), {
      type: 'ai',
      id: 'mcp-key:9',
      label: 'AI agent (ana@x.test)',
    })
  })
})

