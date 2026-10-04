import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyOperations } from '../core/operations'
import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { layoutAfterChange, layoutBeforeChange } from '../plugin/hook'
import { actorFromUser, resolveOperations, type LiveDocStore } from './apply'
import { requestActor, sessionStream, sseFrame } from './endpoints'
import { createKeyedMutex } from './mutex'
import {
  COLLABORATOR_COLORS,
  collaboratorColor,
  collaboratorName,
  createSessionManager,
  sanitizeAwareness,
  type SessionManagerOptions,
  type SessionTarget,
} from './session'
import type { LiveActor, LiveCommitEvent, LiveSessionEvent, MultiplayerEvent } from './types'

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

/** A fake Payload Local API with one document. Reads and writes can be slowed down or fail. */
function fakeStore(layout: Layout = base, timing: { read?: number; write?: number } = {}) {
  let doc: Record<string, unknown> = { id: 'p1', layout: structuredClone(layout) }
  const writes: Record<string, unknown>[] = []
  let failures = 0
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
        throw new Error('DB down')
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
    failNext(n: number) {
      failures = n
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

  it('retries a failed save and gives up after 3 tries until the next commit', async () => {
    const { commit, clock, db, errors } = setup()
    db.failNext(5)
    await commit([insertAt('x1')])
    await clock.advance(10_000)
    assert.equal(errors.length, 3)
    assert.equal(db.writes.length, 0)
    db.failNext(0)
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

