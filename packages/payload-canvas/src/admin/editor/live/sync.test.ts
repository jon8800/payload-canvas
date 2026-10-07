import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyOperation, findBlock, walkBlocks } from '../../../core'
import type { Block, Layout, Operation } from '../../../core/types'
import type { LiveCommitEvent, LiveCommitRequest, LiveCommitResponse } from '../../../live/types'
import { createEditorStore, UNDO_NONE, UNDO_PARTIAL } from '../store'
import { createSyncEngine, sendRetryDelay, type Schedule, type SyncUpdate } from './sync'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const heading = (id: string, text = id): Block => ({ id, type: 'heading', props: { text } })
const stack = (id: string, children: Block[] = []): Block =>
  children.length > 0 ? { id, type: 'stack', slots: { children } } : { id, type: 'stack' }
const layout = (...blocks: Block[]): Layout => ({ version: 1, blocks })
const ids = (l: Layout) => l.blocks.map((b) => b.id)
const textOf = (l: Layout, id: string) => (findBlock(l, id)?.props as { text?: string } | undefined)?.text
const insert = (block: Block, index: number, parentId: string | null = null): Operation => ({
  type: 'insert',
  block,
  to: { parentId, index },
})
const setText = (id: string, text: string): Operation => ({ type: 'update', id, props: { text } })

/** A manual clock: timers run only when the test says so. */
function manualClock() {
  let timers: { fn: () => void; cancelled: boolean }[] = []
  const schedule: Schedule = (fn) => {
    const timer = { fn, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  return {
    schedule,
    /** Runs every timer that is due (all of them: the delays are not modelled). */
    tick() {
      const due = timers
      timers = []
      for (const timer of due) if (!timer.cancelled) timer.fn()
    },
    get pending() {
      return timers.filter((t) => !t.cancelled).length
    },
  }
}

let batchSeq = 0
function setup(initial: Layout = layout(heading('a'), heading('b')), clientId = 'me') {
  const clock = manualClock()
  const sent: LiveCommitRequest[] = []
  const updates: SyncUpdate[] = []
  let resyncs = 0
  const engine = createSyncEngine(initial, {
    clientId,
    schedule: clock.schedule,
    newBatchId: () => `b${++batchSeq}`,
  })
  engine.subscribe((u) => updates.push(u))
  engine.onResync(() => resyncs++)
  engine.setTransport((request) => sent.push(request))
  return {
    engine,
    clock,
    sent,
    updates,
    get resyncs() {
      return resyncs
    },
    /** Goes live on a session with `initial` at `seq`. */
    live(seq = 0, l: Layout = initial, sessionId = 's1') {
      engine.session(seq, l, sessionId)
    },
  }
}

const remote = (seq: number, ops: Operation[], clientId = 'other', batchId?: string): LiveCommitEvent => ({
  type: 'commit',
  seq,
  ops,
  actor: { type: 'user', id: clientId, label: clientId === 'other' ? 'Ana' : clientId },
  clientId,
  batchId,
  at: '2026-10-04T00:00:00.000Z',
})
const echo = (request: LiveCommitRequest, seq: number, ops = request.ops): LiveCommitEvent =>
  remote(seq, ops, request.clientId, request.batchId)

function local(engine: ReturnType<typeof setup>['engine'], ops: Operation | Operation[], tag = 'x') {
  const result = engine.local(Array.isArray(ops) ? ops : [ops], tag)
  if (!result.ok) throw new Error(result.error)
  return result
}

// ---------------------------------------------------------------------------
// Solo mode
// ---------------------------------------------------------------------------

describe('solo mode', () => {
  it('applies local edits to confirmed and visible, sends nothing', () => {
    const t = setup()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    const s = t.engine.getState()
    assert.equal(textOf(s.visible, 'a'), 'A')
    assert.equal(s.confirmed, s.visible)
    assert.equal(s.pending, 0)
    assert.equal(t.sent.length, 0)
  })

  it('refuses an invalid op and leaves the layout alone', () => {
    const t = setup()
    const before = t.engine.getState().visible
    const result = t.engine.local([setText('missing', 'x')], 't')
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /^Operation 0 \(update\): Block "missing" not found/)
    assert.equal(t.engine.getState().visible, before)
  })

  it('ignores commits while solo', () => {
    const t = setup()
    t.engine.commit(remote(1, [setText('a', 'R')]))
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'a')
  })

  it('returns the inverse operations', () => {
    const t = setup()
    const result = local(t.engine, setText('a', 'A'))
    assert.deepEqual(result.inverse, [{ type: 'update', id: 'a', props: { text: 'a' } }])
  })
})

// ---------------------------------------------------------------------------
// Sending and acknowledgements
// ---------------------------------------------------------------------------

describe('sending', () => {
  it('queues edits before the first session and sends them after it', () => {
    const t = setup()
    t.engine.setMode('live')
    local(t.engine, setText('a', 'A'), 't1')
    t.clock.tick()
    assert.equal(t.sent.length, 0)
    t.live(5)
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'A')
    t.clock.tick()
    assert.equal(t.sent.length, 1)
    assert.equal(t.sent[0].baseSeq, 5)
    assert.deepEqual(t.sent[0].ops, [setText('a', 'A')])
  })

  it('coalesces edits made before the flush into one batch', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', '1'), 't1')
    local(t.engine, setText('a', '12'), 't2')
    local(t.engine, setText('b', 'B'), 't3')
    assert.equal(t.sent.length, 0)
    t.clock.tick()
    assert.equal(t.sent.length, 1)
    assert.equal(t.sent[0].ops.length, 3)
    assert.equal(t.sent[0].clientId, 'me')
  })

  it('keeps one batch in flight; the next waits for the echo', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', '1'), 't1')
    t.clock.tick()
    local(t.engine, setText('a', '2'), 't2')
    t.clock.tick()
    assert.equal(t.sent.length, 1)
    t.engine.commit(echo(t.sent[0], 1))
    t.clock.tick()
    assert.equal(t.sent.length, 2)
    assert.equal(t.sent[1].baseSeq, 1)
    assert.deepEqual(t.sent[1].ops, [setText('a', '2')])
  })

  it('own echo with identical ops keeps the visible object (no re-render)', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    const before = t.engine.getState().visible
    const count = t.updates.length
    t.engine.commit(echo(t.sent[0], 1))
    const s = t.engine.getState()
    assert.equal(s.visible, before)
    assert.equal(s.inflight, null)
    assert.equal(s.seq, 1)
    assert.equal(t.updates.length, count)
    assert.deepEqual(s.confirmed, s.visible)
  })

  it('own echo with different ops (server translated) rebases on the server ops', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.commit(echo(t.sent[0], 1, [setText('a', 'A!')]))
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'A!')
    assert.equal(t.updates.at(-1)?.reason, 'own')
  })

  it('a successful response alone does not clear the batch: the echo does', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.response(t.sent[0].batchId, { ok: true, seq: 1 })
    assert.notEqual(t.engine.getState().inflight, null)
    assert.equal(t.engine.getState().inflight?.ackSeq, 1)
    t.engine.commit(echo(t.sent[0], 1))
    assert.equal(t.engine.getState().inflight, null)
  })

  it('a response for an unknown batch is ignored', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.response('nope', { ok: false, error: 'x', seq: 0 })
    assert.equal(t.engine.getState().inflight?.batchId, t.sent[0].batchId)
  })

  it('sends a duplicate as the insert of the finished copy, with the same child ids', () => {
    const t = setup(layout(stack('s', [heading('h')])))
    t.live()
    local(t.engine, { type: 'duplicate', id: 's', newId: 's2' })
    t.clock.tick()
    const op = t.sent[0].ops[0]
    assert.equal(op.type, 'insert')
    if (op.type !== 'insert') return
    assert.deepEqual(op.to, { parentId: null, slot: 'children', index: 1 })
    const copy = t.engine.getState().visible.blocks[1]
    assert.deepEqual(op.block, copy)
    assert.notEqual(copy.slots?.children[0].id, 'h')
    // The echo applies cleanly to confirmed and matches visible.
    t.engine.commit(echo(t.sent[0], 1))
    assert.deepEqual(t.engine.getState().confirmed, t.engine.getState().visible)
  })

  it('does not send while there is no transport, then sends when one is set', () => {
    const t = setup()
    t.engine.setTransport(null)
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    assert.equal(t.sent.length, 0)
    t.engine.setTransport((r) => t.sent.push(r))
    t.clock.tick()
    assert.equal(t.sent.length, 1)
  })

  it('pending counts inflight and queued changes', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', '1'), 't1')
    t.clock.tick()
    local(t.engine, setText('a', '2'), 't2')
    assert.equal(t.engine.getState().pending, 2)
  })

  it('discards unconfirmed changes on a reset session', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', '1'), 't1')
    t.clock.tick()
    local(t.engine, setText('a', '2'), 't2')
    assert.equal(t.engine.getState().pending, 2)
    const updates: SyncUpdate[] = []
    t.engine.subscribe((u) => updates.push(u))
    t.engine.session(5, layout(heading('z')), 's2', true)
    const s = t.engine.getState()
    assert.equal(s.pending, 0)
    assert.deepEqual(ids(s.visible), ['z'])
    assert.equal(updates.at(-1)?.reset, true)
  })
})

// ---------------------------------------------------------------------------
// Remote commits and rebase
// ---------------------------------------------------------------------------

describe('remote commits', () => {
  it('applies a remote commit and reports it', () => {
    const t = setup()
    t.live()
    t.engine.commit(remote(1, [setText('b', 'Ana')]))
    const s = t.engine.getState()
    assert.equal(textOf(s.visible, 'b'), 'Ana')
    assert.equal(s.seq, 1)
    assert.equal(t.updates.at(-1)?.reason, 'remote')
    assert.equal(t.updates.at(-1)?.commit?.actor.label, 'Ana')
  })

  it('rebases queued edits on top of a remote commit', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'mine'))
    t.engine.commit(remote(1, [insert(heading('r'), 0)]))
    const s = t.engine.getState()
    assert.deepEqual(ids(s.visible), ['r', 'a', 'b'])
    assert.equal(textOf(s.visible, 'a'), 'mine')
    assert.equal(textOf(s.confirmed, 'a'), 'a')
  })

  it('rebases inflight and queued edits; confirmed holds only server state', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'one'), 't1')
    t.clock.tick()
    local(t.engine, setText('b', 'two'), 't2')
    t.engine.commit(remote(1, [insert(heading('r'), 2)]))
    const s = t.engine.getState()
    assert.deepEqual(ids(s.visible), ['a', 'b', 'r'])
    assert.equal(textOf(s.visible, 'a'), 'one')
    assert.equal(textOf(s.visible, 'b'), 'two')
    assert.equal(textOf(s.confirmed, 'a'), 'a')
  })

  it('drops a queued edit to a block someone deleted and reports its tag', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('b', 'mine'), 'lost')
    local(t.engine, setText('a', 'kept'), 'kept')
    t.engine.commit(remote(1, [{ type: 'remove', id: 'b' }]))
    const update = t.updates.at(-1)
    assert.deepEqual(update?.dropped, ['lost'])
    assert.deepEqual(ids(t.engine.getState().visible), ['a'])
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'kept')
    t.clock.tick()
    assert.deepEqual(t.sent[0].ops, [setText('a', 'kept')])
  })

  it('drops edits that depend on a dropped edit', () => {
    const t = setup(layout(stack('s')))
    t.live()
    local(t.engine, insert(heading('n'), 0, 's'), 'ins')
    local(t.engine, setText('n', 'typed'), 'typ')
    t.engine.commit(remote(1, [{ type: 'remove', id: 's' }]))
    assert.deepEqual(t.updates.at(-1)?.dropped, ['ins', 'typ'])
    assert.deepEqual(t.engine.getState().visible, layout())
  })

  it('skips (does not drop) an inflight change that no longer applies; the server rejects it', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('b', 'mine'), 'flying')
    t.clock.tick()
    t.engine.commit(remote(1, [{ type: 'remove', id: 'b' }]))
    assert.deepEqual(t.updates.at(-1)?.dropped, [])
    assert.deepEqual(ids(t.engine.getState().visible), ['a'])
    assert.notEqual(t.engine.getState().inflight, null)
  })

  it('ignores a duplicate (already seen) commit', () => {
    const t = setup()
    t.live()
    t.engine.commit(remote(1, [insert(heading('r'), 0)]))
    t.engine.commit(remote(1, [insert(heading('r'), 0)]))
    assert.deepEqual(ids(t.engine.getState().visible), ['r', 'a', 'b'])
    assert.equal(t.resyncs, 0)
  })

  it('treats an own commit that is not the inflight batch (a resend) as remote', () => {
    const t = setup()
    t.live()
    t.engine.commit(remote(1, [setText('a', 'old send')], 'me', 'b-old'))
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'old send')
    assert.equal(t.updates.at(-1)?.reason, 'remote')
  })

  it('last write wins per prop: a remote write after mine is confirmed after mine', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'mine'))
    t.clock.tick()
    t.engine.commit(echo(t.sent[0], 1))
    t.engine.commit(remote(2, [setText('a', 'theirs')]))
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'theirs')
  })

  it('my pending write stays visible over an earlier remote write to the same prop', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'mine'))
    t.engine.commit(remote(1, [setText('a', 'theirs')]))
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'mine')
  })

  it('edits to different props of one block merge', () => {
    const t = setup()
    t.live()
    local(t.engine, { type: 'update', id: 'a', className: 'p-4' })
    t.engine.commit(remote(1, [setText('a', 'theirs')]))
    const a = findBlock(t.engine.getState().visible, 'a')
    assert.equal(a?.className, 'p-4')
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'theirs')
  })

  it('rebases a move after a remote insert in the same list', () => {
    const t = setup(layout(heading('a'), heading('b'), heading('c')))
    t.live()
    local(t.engine, { type: 'move', id: 'c', to: { parentId: null, index: 0 } })
    t.engine.commit(remote(1, [insert(heading('r'), 1)]))
    assert.deepEqual(ids(t.engine.getState().visible), ['c', 'a', 'r', 'b'])
  })
})

// ---------------------------------------------------------------------------
// Gaps, sessions, reconnects
// ---------------------------------------------------------------------------

describe('gaps and sessions', () => {
  it('a seq gap asks for a resync and stops applying', () => {
    const t = setup()
    t.live()
    t.engine.commit(remote(3, [setText('a', 'late')]))
    assert.equal(t.resyncs, 1)
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'a')
    assert.equal(t.engine.getState().synced, false)
  })

  it('a commit that does not apply to confirmed asks for a resync', () => {
    const t = setup()
    t.live()
    t.engine.commit(remote(1, [setText('ghost', 'x')]))
    assert.equal(t.resyncs, 1)
  })

  it('a session resets confirmed and rebases queued edits', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'mine'), 't1')
    t.engine.disconnected()
    t.engine.session(9, layout(heading('a'), heading('z')), 's1')
    const s = t.engine.getState()
    assert.equal(s.seq, 9)
    assert.deepEqual(ids(s.visible), ['a', 'z'])
    assert.equal(textOf(s.visible, 'a'), 'mine')
    assert.equal(t.updates.at(-1)?.reason, 'session')
  })

  it('a session drops queued edits that no longer apply', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('b', 'mine'), 'lost')
    t.engine.session(4, layout(heading('a')), 's1')
    assert.deepEqual(t.updates.at(-1)?.dropped, ['lost'])
  })

  it('nothing is sent while disconnected; sending resumes on the next session', () => {
    const t = setup()
    t.live()
    t.engine.disconnected()
    local(t.engine, setText('a', 'offline'))
    t.clock.tick()
    assert.equal(t.sent.length, 0)
    t.live(0)
    t.clock.tick()
    assert.equal(t.sent.length, 1)
  })

  it('resumed() (replay without a session) applies replayed commits and sends again', () => {
    const t = setup()
    t.live()
    t.engine.disconnected()
    local(t.engine, setText('a', 'mine'))
    t.engine.resumed()
    t.engine.commit(remote(1, [insert(heading('r'), 0)]))
    t.clock.tick()
    assert.deepEqual(ids(t.engine.getState().visible), ['r', 'a', 'b'])
    assert.equal(t.sent.length, 1)
    assert.equal(t.sent[0].baseSeq, 1)
  })

  it('inflight batch acknowledged by response, then a session that includes it: inflight clears', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.response(t.sent[0].batchId, { ok: true, seq: 1 })
    t.engine.disconnected()
    const server = layout(heading('a', 'A'), heading('b'))
    t.engine.session(1, server, 's1')
    assert.equal(t.engine.getState().inflight, null)
    assert.deepEqual(t.engine.getState().visible, server)
  })

  it('session before the response: the response with seq <= session seq clears inflight', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.disconnected()
    t.engine.session(1, layout(heading('a', 'A'), heading('b')), 's1')
    assert.notEqual(t.engine.getState().inflight, null)
    t.engine.response(t.sent[0].batchId, { ok: true, seq: 1 })
    assert.equal(t.engine.getState().inflight, null)
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'A')
  })

  it('a session with a new id (server restart) sends the inflight batch again', () => {
    const t = setup()
    t.live(3)
    local(t.engine, setText('a', 'A'), 't1')
    t.clock.tick()
    t.engine.disconnected()
    t.engine.session(0, layout(heading('a'), heading('b')), 's2')
    t.clock.tick()
    assert.equal(t.sent.length, 2)
    assert.equal(t.sent[1].baseSeq, 0)
    assert.deepEqual(t.sent[1].ops, [setText('a', 'A')])
  })

  it('a stale-session rejection (server seq below our base) asks for a resync and keeps the edits', () => {
    const t = setup()
    t.live(7)
    local(t.engine, setText('a', 'A'), 't1')
    t.clock.tick()
    t.engine.response(t.sent[0].batchId, { ok: false, error: 'stale', seq: 0 })
    assert.equal(t.resyncs, 1)
    assert.equal(t.engine.getState().queued.length, 1)
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'A')
  })

  it('setMode(solo) keeps what the user sees and clears pending state', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.setMode('solo')
    const s = t.engine.getState()
    assert.equal(s.pending, 0)
    assert.equal(s.confirmed, s.visible)
    assert.equal(textOf(s.visible, 'a'), 'A')
  })
})

// ---------------------------------------------------------------------------
// Rejections and failed sends
// ---------------------------------------------------------------------------

describe('rejections', () => {
  it('a rejected batch waits for the commits it was rejected after, then drops what no longer applies', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('b', 'mine'), 'bad')
    local(t.engine, setText('a', 'good'), 'good')
    t.clock.tick()
    // The server applied Ana's delete (seq 1) first, then rejected our batch.
    t.engine.response(t.sent[0].batchId, { ok: false, error: 'Block "b" not found', seq: 1 })
    t.clock.tick()
    assert.equal(t.sent.length, 1, 'holds until seq 1 arrives')
    t.engine.commit(remote(1, [{ type: 'remove', id: 'b' }]))
    assert.deepEqual(t.updates.at(-1)?.dropped, ['bad'])
    t.clock.tick()
    assert.equal(t.sent.length, 2)
    assert.deepEqual(t.sent[1].ops, [setText('a', 'good')])
  })

  it('the rejected update reports the server error only when something was dropped', () => {
    const t = setup()
    t.live()
    t.engine.commit(remote(1, [{ type: 'remove', id: 'b' }]))
    local(t.engine, setText('a', 'x'), 'x')
    t.clock.tick()
    t.engine.response(t.sent[0].batchId, { ok: false, error: 'server says no', seq: 1 })
    const update = t.updates.at(-1)
    assert.equal(update?.reason, 'rejected')
    assert.deepEqual(update?.dropped, [])
    assert.equal(update?.error, undefined)
  })

  it('a change rejected twice is sent alone, and dropped when rejected alone', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'policy-violation'), 'bad')
    local(t.engine, setText('b', 'fine'), 'fine')
    t.clock.tick()
    t.engine.response(t.sent[0].batchId, { ok: false, error: 'validation', seq: 0 })
    t.clock.tick()
    assert.equal(t.sent.length, 2)
    assert.deepEqual(t.sent[1].ops, [setText('a', 'policy-violation')], 'retried alone')
    t.engine.response(t.sent[1].batchId, { ok: false, error: 'validation', seq: 0 })
    assert.deepEqual(t.updates.at(-1)?.dropped, ['bad'])
    assert.equal(t.updates.at(-1)?.error, 'validation')
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'a')
    t.clock.tick()
    assert.equal(t.sent.length, 3)
    assert.deepEqual(t.sent[2].ops, [setText('b', 'fine')], 'the good change is retried alone too')
  })

  it('a failed send retries the same changes after the delay', () => {
    const t = setup()
    t.live()
    local(t.engine, setText('a', 'A'))
    t.clock.tick()
    t.engine.sendFailed(t.sent[0].batchId, 1000)
    assert.equal(t.engine.getState().inflight, null)
    assert.equal(t.engine.getState().queued.length, 1)
    t.clock.tick() // the retry timer
    t.clock.tick() // the flush
    assert.equal(t.sent.length, 2)
    assert.deepEqual(t.sent[1].ops, t.sent[0].ops)
    assert.notEqual(t.sent[1].batchId, t.sent[0].batchId)
  })

  it('a resend of an insert the server already applied is dropped, not duplicated', () => {
    const t = setup()
    t.live()
    local(t.engine, insert(heading('n'), 0), 'ins')
    t.clock.tick()
    // The server applied it (seq 1) but the response was lost.
    t.engine.sendFailed(t.sent[0].batchId, 10)
    t.engine.commit(remote(1, t.sent[0].ops, 'me', t.sent[0].batchId))
    assert.deepEqual(t.updates.at(-1)?.dropped, ['ins'])
    assert.deepEqual(ids(t.engine.getState().visible), ['n', 'a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// Offline: a transport that fails (network down, server errors)
// ---------------------------------------------------------------------------

/** A clock with real delays: timers run when `advance` passes their time. */
function timedClock() {
  let now = 0
  let timers: { at: number; fn: () => void; cancelled: boolean }[] = []
  const schedule: Schedule = (fn, ms) => {
    const timer = { at: now + ms, fn, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  return {
    schedule,
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        const due = timers.filter((t) => !t.cancelled && t.at <= end).toSorted((a, b) => a.at - b.at)[0]
        if (!due) break
        timers = timers.filter((t) => t !== due)
        now = due.at
        due.fn()
      }
      now = end
    },
  }
}

/** An engine whose transport fails while `down` is true, like fetch does for the live hook. */
function flaky(initial: Layout = layout(heading('a'), heading('b'))) {
  const clock = timedClock()
  const sent: LiveCommitRequest[] = []
  const failed: LiveCommitRequest[] = []
  let down = true
  const engine = createSyncEngine(initial, { clientId: 'me', schedule: clock.schedule, newBatchId: () => `f${++batchSeq}` })
  engine.setTransport((request) => {
    if (down) {
      failed.push(request)
      engine.sendFailed(request.batchId)
      return
    }
    sent.push(request)
  })
  engine.session(0, initial, 's1')
  return {
    engine,
    clock,
    sent,
    failed,
    set down(value: boolean) {
      down = value
    },
  }
}

describe('offline (failing transport)', () => {
  it('keeps every change queued and visible while sends fail, with backoff', () => {
    const t = flaky()
    local(t.engine, setText('a', 'A1'), 'one')
    t.clock.advance(30) // coalesce, then the send fails
    assert.equal(t.failed.length, 1)
    assert.equal(t.engine.getState().sendFailures, 1)
    assert.equal(t.engine.getState().inflight, null)
    local(t.engine, setText('b', 'B1'), 'two')
    assert.equal(t.engine.getState().pending, 2)
    assert.equal(textOf(t.engine.getState().visible, 'a'), 'A1')
    assert.equal(textOf(t.engine.getState().visible, 'b'), 'B1')
    // Retries after 1 s, 2 s, 4 s (each failing): nothing goes out in between.
    t.clock.advance(999)
    assert.equal(t.failed.length, 1)
    t.clock.advance(1 + 30)
    assert.equal(t.failed.length, 2)
    t.clock.advance(2000 + 30)
    assert.equal(t.failed.length, 3)
    t.clock.advance(3999)
    assert.equal(t.failed.length, 3)
    t.clock.advance(1 + 30)
    assert.equal(t.failed.length, 4)
    assert.equal(t.engine.getState().sendFailures, 4)
    // Every retry carries both changes, in order.
    assert.deepEqual(t.failed[3].ops, [setText('a', 'A1'), setText('b', 'B1')])
    assert.equal(t.engine.getState().pending, 2)
  })

  it('sends the queue once the network is back, and the answer ends the offline state', () => {
    const t = flaky()
    local(t.engine, setText('a', 'A1'), 'one')
    t.clock.advance(30)
    t.down = false
    t.clock.advance(1000 + 30)
    assert.equal(t.sent.length, 1)
    t.engine.response(t.sent[0].batchId, { ok: true, seq: 1 })
    assert.equal(t.engine.getState().sendFailures, 0)
    t.engine.commit(echo(t.sent[0], 1))
    assert.equal(t.engine.getState().pending, 0)
    assert.equal(textOf(t.engine.getState().confirmed, 'a'), 'A1')
  })

  it('the echo arriving before the HTTP answer also ends the offline state', () => {
    const t = flaky()
    local(t.engine, setText('a', 'A1'))
    t.clock.advance(30)
    t.down = false
    t.clock.advance(1000 + 30)
    t.engine.commit(echo(t.sent[0], 1))
    assert.equal(t.engine.getState().sendFailures, 0)
    t.engine.response(t.sent[0].batchId, { ok: true, seq: 1 })
    assert.equal(t.engine.getState().sendFailures, 0)
  })

  it('retryNow sends at once instead of waiting for the backoff', () => {
    const t = flaky()
    local(t.engine, setText('a', 'A1'))
    t.clock.advance(30)
    t.clock.advance(1000 + 30)
    t.clock.advance(2000 + 30) // 3 failures: the next try waits 4 s
    t.down = false
    t.engine.retryNow()
    t.clock.advance(30)
    assert.equal(t.sent.length, 1)
  })

  it('a new session (the stream is back) sends the queue at once and rebases it', () => {
    const t = flaky()
    local(t.engine, setText('a', 'A1'), 'one')
    t.clock.advance(30)
    t.engine.disconnected()
    t.down = false
    // Meanwhile someone else changed "b".
    t.engine.session(1, layout(heading('a'), heading('b', 'B-remote')), 's1')
    t.clock.advance(30)
    assert.equal(t.sent.length, 1)
    assert.equal(t.sent[0].baseSeq, 1)
    assert.deepEqual(t.sent[0].ops, [setText('a', 'A1')])
    const visible = t.engine.getState().visible
    assert.equal(textOf(visible, 'a'), 'A1')
    assert.equal(textOf(visible, 'b'), 'B-remote')
  })

  it('backs off to every 15 s', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(sendRetryDelay), [1000, 2000, 4000, 8000, 15_000, 15_000])
  })
})

// ---------------------------------------------------------------------------
// Store integration: undo across remote edits
// ---------------------------------------------------------------------------

function liveStore(initial: Layout) {
  const clock = manualClock()
  const store = createEditorStore(initial, { sync: { clientId: 'me', schedule: clock.schedule } })
  const sent: LiveCommitRequest[] = []
  const warnings: string[] = []
  store.onWarning((w) => warnings.push(w))
  store.sync.setTransport((r) => sent.push(r))
  store.sync.session(0, initial, 's1')
  let seq = 0
  return {
    store,
    clock,
    sent,
    warnings,
    remote(ops: Operation[]) {
      store.sync.commit(remote(++seq, ops))
    },
    /** Flushes and echoes everything this client has pending. */
    ack() {
      for (;;) {
        clock.tick()
        const request = sent.at(-1)
        const inflight = store.sync.getState().inflight
        if (!request || !inflight || inflight.batchId !== request.batchId) return
        store.sync.commit(echo(request, ++seq))
      }
    },
  }
}

describe('store with sync', () => {
  it('remote changes never enter the undo history', () => {
    const t = liveStore(layout(heading('a')))
    t.remote([insert(heading('r'), 1)])
    assert.equal(t.store.getState().undoStack.length, 0)
    assert.deepEqual(ids(t.store.getState().layout), ['a', 'r'])
  })

  it('undo reverts only my edit, keeping a remote edit made after it', () => {
    const t = liveStore(layout(heading('a')))
    t.store.apply(insert(heading('mine'), 1))
    t.ack()
    t.remote([insert(heading('theirs'), 0)])
    t.store.undo()
    assert.deepEqual(ids(t.store.getState().layout), ['theirs', 'a'])
    t.ack()
    assert.deepEqual(t.store.sync.getState().confirmed, t.store.getState().layout)
  })

  it('undo is sent to the server like any edit', () => {
    const t = liveStore(layout(heading('a')))
    t.store.apply(setText('a', 'A'))
    t.ack()
    t.store.undo()
    t.clock.tick()
    assert.deepEqual(t.sent.at(-1)?.ops, [setText('a', 'a')])
  })

  it('undo of an edit whose block someone deleted warns and does nothing', () => {
    const t = liveStore(layout(heading('a'), heading('b')))
    t.store.apply(setText('b', 'B'))
    t.ack()
    t.remote([{ type: 'remove', id: 'b' }])
    t.store.undo()
    assert.deepEqual(t.warnings, [UNDO_NONE])
    assert.deepEqual(ids(t.store.getState().layout), ['a'])
    assert.equal(t.store.getState().undoStack.length, 0)
  })

  it('undo of a group skips the part someone else broke and applies the rest', () => {
    const t = liveStore(layout(heading('a'), heading('b')))
    t.store.apply(setText('a', 'A'), { group: 'g' })
    t.store.apply(setText('b', 'B'), { group: 'g' })
    t.ack()
    t.remote([{ type: 'remove', id: 'b' }])
    t.store.undo()
    assert.deepEqual(t.warnings, [UNDO_PARTIAL])
    assert.equal(textOf(t.store.getState().layout, 'a'), 'a')
  })

  it('undo of a move clamps the index when the list got shorter', () => {
    const t = liveStore(layout(heading('a'), heading('b'), heading('c')))
    t.store.apply({ type: 'move', id: 'c', to: { parentId: null, index: 0 } })
    t.ack()
    t.remote([{ type: 'remove', id: 'a' }, { type: 'remove', id: 'b' }, insert(heading('x'), 0)])
    t.store.undo()
    assert.deepEqual(ids(t.store.getState().layout), ['x', 'c'])
    assert.deepEqual(t.warnings, [])
  })

  it('an edit dropped on rebase leaves the undo history and warns', () => {
    const t = liveStore(layout(heading('a'), heading('b')))
    t.store.apply(setText('b', 'B'))
    assert.equal(t.store.getState().undoStack.length, 1)
    t.remote([{ type: 'remove', id: 'b' }])
    assert.equal(t.store.getState().undoStack.length, 0)
    assert.equal(t.warnings.length, 1)
  })

  it('selection clears with a note when someone deletes the selected block', () => {
    const t = liveStore(layout(heading('a'), heading('b')))
    t.store.select('b')
    t.remote([{ type: 'remove', id: 'b' }])
    assert.equal(t.store.getState().selectedId, null)
    assert.deepEqual(t.warnings, ['Ana deleted the block you had selected.'])
  })

  it('redo after undo works across a remote edit', () => {
    const t = liveStore(layout(heading('a')))
    t.store.apply(setText('a', 'A'))
    t.store.undo()
    t.remote([insert(heading('r'), 1)])
    t.store.redo()
    t.ack()
    assert.equal(textOf(t.store.getState().layout, 'a'), 'A')
    assert.deepEqual(ids(t.store.getState().layout), ['a', 'r'])
  })

  it('a reset session replaces the layout and clears the undo history', () => {
    const t = liveStore(layout(heading('a')))
    t.store.apply(setText('a', 'A'))
    t.ack()
    assert.equal(t.store.getState().undoStack.length, 1)
    t.store.sync.session(9, layout(heading('p')), 's2', true)
    assert.deepEqual(ids(t.store.getState().layout), ['p'])
    assert.equal(t.store.getState().undoStack.length, 0)
    assert.equal(t.store.getState().redoStack.length, 0)
  })
})

// ---------------------------------------------------------------------------
// Convergence: two clients, one simulated server, random ops and random delivery
// ---------------------------------------------------------------------------

/** Deterministic random numbers (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type SimClient = {
  name: string
  engine: ReturnType<typeof createSyncEngine>
  clock: ReturnType<typeof manualClock>
  /** Requests on the way to the server (FIFO). */
  up: LiveCommitRequest[]
  /** Server events on the way to this client (FIFO, like one SSE stream). */
  down: LiveCommitEvent[]
  /** HTTP responses on the way back (any order relative to events). */
  responses: { batchId: string; response: LiveCommitResponse }[]
}

function allBlocks(l: Layout): Block[] {
  const out: Block[] = []
  walkBlocks(l, (b) => {
    out.push(b)
  })
  return out
}

function simulate(seed: number, steps: number, clientCount = 2) {
  const rnd = random(seed)
  const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)]
  let server = { seq: 0, layout: layout(stack('root', [heading('h1')]), heading('h2')) }
  let nextId = 0
  let rejections = 0
  let dropped = 0
  const clients: SimClient[] = Array.from({ length: clientCount }, (_, i) => {
    const clock = manualClock()
    const client: SimClient = {
      name: `c${i}`,
      engine: createSyncEngine(server.layout, { clientId: `c${i}`, schedule: clock.schedule, newBatchId: () => `c${i}-${++nextId}` }),
      clock,
      up: [],
      down: [],
      responses: [],
    }
    client.engine.setTransport((r) => client.up.push(r))
    client.engine.subscribe((u) => {
      dropped += u.dropped.length
    })
    client.engine.session(0, server.layout, 'sim')
    return client
  })

  const randomOp = (l: Layout): Operation | null => {
    const blocks = allBlocks(l)
    const containers = blocks.filter((b) => b.type === 'stack')
    const roll = rnd()
    if (roll < 0.3 || blocks.length === 0) {
      const parent = rnd() < 0.5 || containers.length === 0 ? null : pick(containers)
      const length = parent ? (parent.slots?.children?.length ?? 0) : l.blocks.length
      const id = `n${++nextId}`
      const block = rnd() < 0.3 ? stack(id) : heading(id)
      return insert(block, Math.floor(rnd() * (length + 1)), parent?.id ?? null)
    }
    const target = pick(blocks)
    if (roll < 0.6) return { type: 'update', id: target.id, props: { text: `t${++nextId}` }, ...(rnd() < 0.3 ? { className: `p-${nextId % 9}` } : {}) }
    if (roll < 0.72) return { type: 'remove', id: target.id }
    if (roll < 0.82) return { type: 'duplicate', id: target.id, newId: `d${++nextId}` }
    const parent = rnd() < 0.5 || containers.length === 0 ? null : pick(containers)
    const length = parent ? (parent.slots?.children?.length ?? 0) : l.blocks.length
    return { type: 'move', id: target.id, to: { parentId: parent?.id ?? null, index: Math.floor(rnd() * (length + 1)) } }
  }

  const serverCommit = (client: SimClient, request: LiveCommitRequest) => {
    let response: LiveCommitResponse
    if (request.baseSeq > server.seq) response = { ok: false, error: 'stale', seq: server.seq }
    else {
      let next: Layout | null = server.layout
      for (const op of request.ops) {
        const r = applyOperation(next, op)
        if (!r.ok) {
          next = null
          break
        }
        next = r.layout
      }
      if (!next) {
        rejections++
        response = { ok: false, error: 'conflict', seq: server.seq }
      }
      else {
        server = { seq: server.seq + 1, layout: next }
        const event: LiveCommitEvent = {
          type: 'commit',
          seq: server.seq,
          ops: request.ops,
          actor: { type: 'user', id: client.name, label: client.name },
          clientId: request.clientId,
          batchId: request.batchId,
          at: '',
        }
        for (const c of clients) c.down.push(event)
        response = { ok: true, seq: server.seq }
      }
    }
    client.responses.push({ batchId: request.batchId, response })
  }

  const step = (allowLocal: boolean) => {
    const actions: (() => void)[] = []
    for (const c of clients) {
      if (allowLocal) {
        actions.push(() => {
          const op = randomOp(c.engine.getState().visible)
          if (op) c.engine.local([op], `${c.name}-${++nextId}`)
        })
      }
      if (c.clock.pending > 0) actions.push(() => c.clock.tick())
      if (c.up.length > 0) actions.push(() => serverCommit(c, c.up.shift() as LiveCommitRequest))
      if (c.down.length > 0) actions.push(() => c.engine.commit(c.down.shift() as LiveCommitEvent))
      if (c.responses.length > 0) {
        actions.push(() => {
          const { batchId, response } = c.responses.shift() as SimClient['responses'][number]
          c.engine.response(batchId, response)
        })
      }
    }
    if (actions.length === 0) return false
    pick(actions)()
    return true
  }

  for (let i = 0; i < steps; i++) step(rnd() < 0.35)
  // Drain: no new local edits, deliver everything.
  let guard = 0
  while (step(false)) {
    if (++guard > 100_000) throw new Error('did not settle')
  }
  return { server, clients, rejections, dropped }
}

describe('convergence (property test)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`two clients converge to the server layout (seed ${seed})`, () => {
      const { server, clients } = simulate(seed, 400)
      for (const c of clients) {
        const s = c.engine.getState()
        assert.equal(s.pending, 0, `${c.name} has nothing pending`)
        assert.equal(s.seq, server.seq)
        assert.deepEqual(s.confirmed, server.layout)
        assert.deepEqual(s.visible, server.layout)
      }
    })
  }

  for (let seed = 101; seed <= 110; seed++) {
    it(`three clients converge (seed ${seed})`, () => {
      const { server, clients } = simulate(seed, 600, 3)
      for (const c of clients) assert.deepEqual(c.engine.getState().visible, server.layout)
    })
  }

  it('the runs cover conflicts: rejections and dropped changes happen, and most edits still land', () => {
    let rejections = 0
    let dropped = 0
    for (let seed = 1; seed <= 20; seed++) {
      const run = simulate(seed, 400)
      assert.ok(run.server.seq > 20, `only ${run.server.seq} commits`)
      rejections += run.rejections
      dropped += run.dropped
    }
    assert.ok(rejections > 0, 'no rejections')
    assert.ok(dropped > 0, 'no dropped changes')
  })
})
