import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyOperations } from '../core/operations'
import type { BlockDefinition, Layout } from '../core/types'
import { actorFromUser, applyLiveOperations, resolveOperations, type LiveDocStore } from './apply'
import { channelKey, createMemoryBus, type BusMessage, type LiveMember } from './bus'
import { eventStream, presenceFor, sseFrame } from './endpoints'
import { createKeyedMutex } from './mutex'
import type { LiveRuntime } from './runtime'
import type { LiveActor, LiveOperationsEvent } from './types'

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
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const iso = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()

/** A fake Payload Local API with one document. Reads and writes can be slowed down. */
function fakeStore(layout: Layout = base, timing: { read?: number; write?: number } = {}) {
  let doc: Record<string, unknown> = { id: 'p1', updatedAt: iso(0), layout: structuredClone(layout) }
  let version = 0
  const writes: Record<string, unknown>[] = []
  const store: LiveDocStore = {
    async findByID(args) {
      await delay(timing.read ?? 0)
      if (args.id !== 'p1') throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(doc)
    },
    async update(args) {
      await delay(timing.write ?? 0)
      writes.push(args)
      version += 1
      doc = { ...doc, ...structuredClone(args.data as Record<string, unknown>), updatedAt: iso(version) }
      return structuredClone(doc)
    },
  }
  return { store, writes, get doc() { return doc } }
}

function runtime(): LiveRuntime {
  return { bus: createMemoryBus(), mutex: createKeyedMutex() }
}

function apply(rt: LiveRuntime, store: LiveDocStore, ops: unknown[] | ((layout: Layout) => never[] | string)) {
  return applyLiveOperations({
    payload: store,
    user: { id: 1 },
    collection: 'pages',
    id: 'p1',
    field: 'layout',
    drafts: true,
    blocks,
    ops,
    actor: ai,
    runtime: rt,
  })
}

const heading = (id: string, text = 'New') => ({ id, type: 'heading', props: { text } })

// ---------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------

const event = (n: number): Omit<LiveOperationsEvent, 'eventId'> => ({
  type: 'operations',
  ops: [{ type: 'remove', id: `b${n}` }],
  actor: ai,
  at: iso(n),
})

describe('memory bus', () => {

  it('delivers events to subscribers of the same channel only', async () => {
    const bus = createMemoryBus()
    const a: BusMessage[] = []
    const b: BusMessage[] = []
    bus.subscribe('pages:1', (m) => a.push(m))
    bus.subscribe('pages:2', (m) => b.push(m))
    const published = await bus.publish('pages:1', event(1))
    assert.equal(a.length, 1)
    assert.equal(b.length, 0)
    assert.deepEqual(a[0], published)
    assert.match(published.eventId, /^[0-9a-f]{8}:1$/)
  })

  it('stops delivering after unsubscribe and keeps going when a listener throws', async () => {
    const bus = createMemoryBus()
    const seen: BusMessage[] = []
    bus.subscribe('c', () => {
      throw new Error('closed stream')
    })
    const off = bus.subscribe('c', (m) => seen.push(m))
    await bus.publish('c', event(1))
    off()
    await bus.publish('c', event(2))
    assert.equal(seen.length, 1)
  })

  it('replays events after an event id', async () => {
    const bus = createMemoryBus()
    const first = await bus.publish('c', event(1))
    const second = await bus.publish('c', event(2))
    const third = await bus.publish('c', event(3))
    assert.deepEqual(await bus.replay('c', { afterEventId: first.eventId }), [second, third])
    assert.deepEqual(await bus.replay('c', { afterEventId: third.eventId }), [])
    assert.equal(await bus.head('c'), third.eventId)
  })

  it('replays events after a time', async () => {
    const bus = createMemoryBus()
    await bus.publish('c', event(1))
    const second = await bus.publish('c', event(2))
    assert.deepEqual(await bus.replay('c', { afterTime: iso(1) }), [second])
  })

  it('returns null when it cannot fill the gap', async () => {
    let now = 0
    const bus = createMemoryBus({ bufferSize: 2, bufferTtlMs: 1000, now: () => now })
    const first = await bus.publish('c', event(1))
    await bus.publish('c', event(2))
    await bus.publish('c', event(3))
    // Event 2 is still buffered, event 1 is not: a client that saw 1 can catch up, before 1 cannot.
    assert.equal((await bus.replay('c', { afterEventId: first.eventId }))?.length, 2)
    assert.equal(await bus.replay('c', { afterTime: iso(0) }), null)
    // Another process (epoch) or garbage.
    assert.equal(await bus.replay('c', { afterEventId: 'deadbeef:1' }), null)
    assert.equal(await bus.replay('c', { afterEventId: 'nonsense' }), null)
    // Expired by age.
    now = 5000
    assert.equal(await bus.replay('c', { afterEventId: first.eventId }), null)
  })

  it('tracks presence and notifies subscribers on join and leave', async () => {
    const bus = createMemoryBus()
    const seen: BusMessage[] = []
    bus.subscribe('c', (m) => seen.push(m))
    const member: LiveMember = { connectionId: 'x', userId: 'user:1', name: 'Ana', type: 'user' }
    const leave = await bus.join('c', member)
    assert.deepEqual(await bus.members('c'), [member])
    leave()
    leave()
    assert.deepEqual(await bus.members('c'), [])
    assert.deepEqual(
      seen.map((m) => (m.type === 'presence' ? m.members.length : -1)),
      [1, 0],
    )
  })
})

describe('presenceFor', () => {
  it('lists each person once, by name, and marks the viewer', () => {
    const me: LiveMember = { connectionId: 'a', userId: 'user:1', name: 'Ana', type: 'user' }
    const members: LiveMember[] = [
      me,
      { connectionId: 'b', userId: 'user:1', name: 'Ana', type: 'user' },
      { connectionId: 'c', userId: 'user:2', name: 'Ben', type: 'user' },
    ]
    assert.deepEqual(presenceFor(members, me), [
      { name: 'Ana', type: 'user', self: true },
      { name: 'Ben', type: 'user' },
    ])
  })
})

// ---------------------------------------------------------------------------
// Mutex
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

// ---------------------------------------------------------------------------
// Operations (the shared apply path)
// ---------------------------------------------------------------------------

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

describe('applyLiveOperations', () => {
  it('loads the draft, saves a draft and publishes the operations with the actor', async () => {
    const rt = runtime()
    const fake = fakeStore()
    const events: BusMessage[] = []
    rt.bus.subscribe(channelKey('pages', 'p1'), (m) => events.push(m))

    const result = await apply(rt, fake.store, [{ type: 'insert', block: heading('h2'), to: { parentId: 's1', index: 1 } }])
    assert.ok(result.ok)
    assert.equal(fake.writes.length, 1)
    assert.equal(fake.writes[0].draft, true)
    assert.equal(fake.writes[0].overrideAccess, false)
    assert.deepEqual(fake.doc.layout, result.layout)
    assert.equal(events.length, 1)
    const received = events[0] as LiveOperationsEvent
    assert.equal(received.type, 'operations')
    assert.deepEqual(received.actor, ai)
    assert.equal(received.baseVersion, iso(0))
    assert.equal(received.version, iso(1))
    assert.equal(received.at, iso(1))
    assert.deepEqual(received.ops, result.ops)
  })

  it('saves nothing and publishes nothing when an operation fails', async () => {
    const rt = runtime()
    const fake = fakeStore()
    const events: BusMessage[] = []
    rt.bus.subscribe(channelKey('pages', 'p1'), (m) => events.push(m))
    const result = await apply(rt, fake.store, [{ type: 'move', id: 's1', to: { parentId: 'h1', index: 0 } }])
    assert.equal(result.ok, false)
    assert.equal(fake.writes.length, 0)
    assert.equal(events.length, 0)
  })

  it('refuses an invalid result, and allows unfinished blocks in drafts as warnings', async () => {
    const rt = runtime()
    const fake = fakeStore()
    const bad = await apply(rt, fake.store, [{ type: 'insert', block: { id: 'x', type: 'unknown' }, to: { parentId: null, index: 0 } }])
    assert.ok(!bad.ok)
    assert.equal(bad.status, 400)
    assert.equal(bad.errors?.[0].code, 'invalid')
    assert.equal(fake.writes.length, 0)

    const unfinished = await apply(rt, fake.store, [{ type: 'insert', block: { id: 'h9', type: 'heading' }, to: { parentId: null, index: 0 } }])
    assert.ok(unfinished.ok)
    assert.equal(unfinished.warnings[0].code, 'required')
  })

  it('serializes concurrent writes to one document, so none is lost', async () => {
    const rt = runtime()
    // Slow reads and writes: without the lock, both calls would read the same draft.
    const fake = fakeStore(base, { read: 10, write: 10 })
    const results = await Promise.all([
      apply(rt, fake.store, [{ type: 'insert', block: heading('a'), to: { parentId: null, index: 1 } }]),
      apply(rt, fake.store, [{ type: 'insert', block: heading('b'), to: { parentId: null, index: 2 } }]),
      apply(rt, fake.store, [{ type: 'update', id: 'h1', props: { text: 'Third' } }]),
    ])
    assert.ok(results.every((r) => r.ok))
    const layout = fake.doc.layout as Layout
    assert.deepEqual(
      layout.blocks.map((b) => b.id),
      ['s1', 'a', 'b'],
    )
    assert.equal(layout.blocks[0].slots?.children[0].props?.text, 'Third')
    // Event order matches write order.
    const ids = results.map((r) => (r.ok ? r.event.eventId : ''))
    assert.deepEqual(ids.map((id) => Number(id.split(':')[1])), [1, 2, 3])
  })

  it('builds operations from the current draft when given a function', async () => {
    const rt = runtime()
    const fake = fakeStore()
    const result = await applyLiveOperations({
      payload: fake.store,
      user: {},
      collection: 'pages',
      id: 'p1',
      field: 'layout',
      drafts: true,
      blocks,
      ops: (layout) => [{ type: 'insert', block: heading('end'), to: { parentId: null, index: layout.blocks.length } }],
      actor: ai,
      runtime: rt,
    })
    assert.ok(result.ok)
    assert.equal(result.layout.blocks.at(-1)?.id, 'end')

    const refused = await apply(rt, fake.store, () => 'Nope')
    assert.deepEqual(refused, { ok: false, status: 400, error: 'Nope' })
  })

  it('passes on read and write errors with their status', async () => {
    const rt = runtime()
    const fake = fakeStore()
    const missing = await applyLiveOperations({
      payload: fake.store,
      user: {},
      collection: 'pages',
      id: 'nope',
      field: 'layout',
      drafts: true,
      blocks,
      ops: [],
      actor: ai,
      runtime: rt,
    })
    assert.deepEqual(missing, { ok: false, status: 404, error: 'Not Found' })

    const failing: LiveDocStore = {
      findByID: fake.store.findByID,
      update: async () => {
        throw Object.assign(new Error('The following field is invalid: layout'), {
          status: 400,
          data: { errors: [{ message: 'blocks[0]: bad' }] },
        })
      },
    }
    const invalid = await apply(rt, failing, [{ type: 'remove', id: 'h1' }])
    assert.deepEqual(invalid, { ok: false, status: 400, error: 'The following field is invalid: layout\nblocks[0]: bad' })
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

describe('eventStream', () => {
  const member: LiveMember = { connectionId: 'c1', userId: 'user:1', name: 'Ana', type: 'user' }

  it('formats frames as one JSON data line', () => {
    assert.equal(sseFrame('ready', { a: 1 }, '1'), 'id: 1\nevent: ready\ndata: {"a":1}\n\n')
    assert.equal(sseFrame('presence', { a: 'x\ny' }), 'event: presence\ndata: {"a":"x\\ny"}\n\n')
  })

  it('sends ready, replays missed events once, then live events, and leaves on cancel', async () => {
    const bus = createMemoryBus()
    const channel = 'pages:p1'
    const first = await bus.publish(channel, { type: 'operations', ops: [{ type: 'remove', id: 'a' }], actor: ai, at: iso(1) })
    const missed = await bus.publish(channel, { type: 'operations', ops: [{ type: 'remove', id: 'b' }], actor: ai, at: iso(2) })
    const stream = eventStream({ bus, channel, member, replay: { afterEventId: first.eventId }, heartbeatMs: 60_000 })
    const reading = readFrames(stream, 5)
    await delay(10)
    const live = await bus.publish(channel, { type: 'operations', ops: [{ type: 'remove', id: 'c' }], actor: ai, at: iso(3) })
    const frames = await reading

    assert.equal(frames[0], 'retry: 3000')
    assert.match(frames[1], /^event: ready\ndata: /)
    assert.ok(frames[1].includes('"self":true'))
    const operationIds = frames.filter((f) => f.includes('event: operations')).map((f) => /^id: (.*)$/m.exec(f)?.[1])
    assert.deepEqual(operationIds, [missed.eventId, live.eventId])
    assert.ok(frames.some((f) => f.startsWith('event: presence')))
    await delay(0)
    assert.deepEqual(await bus.members(channel), [])
  })

  it('asks for a resync when the gap cannot be replayed', async () => {
    const bus = createMemoryBus()
    const stream = eventStream({ bus, channel: 'c', member, replay: { afterEventId: 'old:1' }, heartbeatMs: 60_000 })
    const frames = await readFrames(stream, 3)
    assert.match(frames[2], /^event: resync\n/)
  })

  it('sends heartbeats', async () => {
    const bus = createMemoryBus()
    const stream = eventStream({ bus, channel: 'c', member, replay: null, heartbeatMs: 5 })
    const frames = await readFrames(stream, 4)
    assert.equal(frames[3], ': ping')
  })
})
