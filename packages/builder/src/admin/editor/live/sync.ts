// Multiplayer sync engine. Pure TypeScript: no React, no DOM, no network. The live hook feeds it
// server events and gives it a `send` function; the editor store feeds it local edits.
//
// State (see docs/architecture.md section 12):
// - `confirmed`: the server's layout at `seq`. Changes only through server commits and sessions.
// - `inflight`: one batch of local changes, sent and not yet acknowledged.
// - `queued`: local changes not sent yet.
// - `visible` = confirmed + inflight + queued. This is what the editor shows.
//
// A local edit applies to `visible` at once and joins the queue. The queue flushes as one batch
// (after a short coalescing delay), one batch in flight at a time. The server broadcasts every
// commit to every editor, the sender included: the sender's own commit is its acknowledgement.
// A remote commit applies to `confirmed`, then the pending changes are re-applied on top
// ("rebase"). A pending change that no longer applies is dropped and reported by its tag, so the
// store can fix its undo history.
//
// In `solo` mode (no live connection) local edits apply to `confirmed` directly and nothing queues.

import { applyOperation, findBlock, findLocation } from '../../../core'
import type { Layout, Operation } from '../../../core/types'
import type { LiveCommitEvent, LiveCommitRequest, LiveCommitResponse } from '../../../live/types'

/** One local edit (one store `apply` call). Applied and dropped as a whole. */
export type PendingChange = {
  tag: string
  ops: Operation[]
  /** How often the server rejected a batch with this change in it. */
  attempts: number
}

export type InflightBatch = {
  batchId: string
  baseSeq: number
  changes: PendingChange[]
  /** Server seq from the commit response. The echo with this seq is still to come. */
  ackSeq: number | null
}

export type SyncMode = 'solo' | 'live'

export type SyncUpdate = {
  layout: Layout
  reason: 'remote' | 'own' | 'rejected' | 'session'
  /** Tags of local changes that no longer apply and were dropped. */
  dropped: string[]
  /** The remote commit, for `reason: 'remote'`. */
  commit?: LiveCommitEvent
  /** The server's reason, for `reason: 'rejected'` when changes were dropped. */
  error?: string
}

export type LocalResult =
  | { ok: true; layout: Layout; inverse: Operation[]; ops: Operation[] }
  | { ok: false; error: string }

export type Schedule = (fn: () => void, ms: number) => () => void

export type SyncOptions = {
  clientId: string
  /** Local edits within this time go out as one batch. Default 30 ms. */
  coalesceMs?: number
  /** Timer function. Tests pass a manual clock. Default `setTimeout`. */
  schedule?: Schedule
  newBatchId?: () => string
}

export type SyncSnapshot = {
  mode: SyncMode
  /** True after a session event, until the connection drops. Only then do batches go out. */
  synced: boolean
  seq: number
  /** The server session the seq belongs to. */
  sessionId: string | null
  confirmed: Layout
  visible: Layout
  inflight: InflightBatch | null
  queued: PendingChange[]
  /** Local changes the server has not confirmed yet. */
  pending: number
}

export type SyncEngine = ReturnType<typeof createSyncEngine>

const defaultSchedule: Schedule = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

let batchCounter = 0
const defaultBatchId = () => `${Date.now().toString(36)}-${(++batchCounter).toString(36)}`

/** Fails like core `applyOperations`, so callers can strip the same "Operation N (type):" prefix. */
function applyLocal(layout: Layout, ops: Operation[]): LocalResult {
  let current = layout
  let inverse: Operation[] = []
  const sent: Operation[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const result = applyOperation(current, op)
    if (!result.ok) return { ok: false, error: `Operation ${i} (${String(op?.type)}): ${result.error}` }
    current = result.layout
    inverse = [...result.inverse, ...inverse]
    sent.push(op.type === 'duplicate' ? duplicateAsInsert(current, op.newId) : op)
  }
  return { ok: true, layout: current, inverse, ops: sent }
}

/**
 * A `duplicate` is sent as the `insert` of the finished copy. The core gives the copy's children
 * new random ids; sending them keeps the ids equal on every client and on the server.
 */
function duplicateAsInsert(layout: Layout, newId: string): Operation {
  const block = findBlock(layout, newId)
  const location = findLocation(layout, newId)
  if (!block || !location) throw new Error(`Internal error: duplicated block "${newId}" not found`)
  return { type: 'insert', block, to: { parentId: location.parentId, slot: location.slot, index: location.index } }
}

function applyAll(layout: Layout, ops: Operation[]): Layout | null {
  let current = layout
  for (const op of ops) {
    const result = applyOperation(current, op)
    if (!result.ok) return null
    current = result.layout
  }
  return current
}

function sameOps(a: Operation[], b: Operation[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
}

export function createSyncEngine(initial: Layout, options: SyncOptions) {
  const coalesceMs = options.coalesceMs ?? 30
  const schedule = options.schedule ?? defaultSchedule
  const newBatchId = options.newBatchId ?? defaultBatchId

  let clientId = options.clientId
  let mode: SyncMode = 'solo'
  let synced = false
  let seq = 0
  let sessionId: string | null = null
  let confirmed = initial
  let visible = initial
  let inflight: InflightBatch | null = null
  let queued: PendingChange[] = []
  /** After a rejection: wait until the confirmed seq reaches the seq the server rejected at. */
  let holdUntil: number | null = null
  /** A retry after a failed send: no flush before it fires. */
  let retryCancel: (() => void) | null = null
  let flushCancel: (() => void) | null = null
  let send: ((request: LiveCommitRequest) => void) | null = null
  const listeners = new Set<(update: SyncUpdate) => void>()
  const resyncListeners = new Set<() => void>()

  const emit = (update: SyncUpdate) => {
    for (const listener of listeners) listener(update)
  }

  const requestResync = () => {
    synced = false
    for (const listener of resyncListeners) listener()
  }

  /** Re-applies inflight and queued changes on `confirmed`. Returns the tags of dropped queued changes. */
  const rebase = (): string[] => {
    let layout = confirmed
    const dropped: string[] = []
    // An inflight change that fails here is skipped, not dropped: the server decides it, and
    // it applies the batch after the same commits, so it will reject it.
    for (const change of inflight?.changes ?? []) layout = applyAll(layout, change.ops) ?? layout
    queued = queued.filter((change) => {
      const next = applyAll(layout, change.ops)
      if (!next) {
        dropped.push(change.tag)
        return false
      }
      layout = next
      return true
    })
    visible = layout
    return dropped
  }

  const canSend = () =>
    mode === 'live' && synced && send !== null && inflight === null && queued.length > 0 && retryCancel === null && (holdUntil === null || seq >= holdUntil)

  const flush = () => {
    flushCancel = null
    if (!canSend() || !send) return
    // A change the server rejected before goes alone, so one bad change cannot sink the others.
    const isolate = queued[0].attempts > 0
    const changes = isolate ? queued.slice(0, 1) : queued
    queued = isolate ? queued.slice(1) : []
    const batch: InflightBatch = { batchId: newBatchId(), baseSeq: seq, changes, ackSeq: null }
    inflight = batch
    send({ clientId, batchId: batch.batchId, baseSeq: batch.baseSeq, ops: changes.flatMap((c) => c.ops) })
  }

  const scheduleFlush = () => {
    if (flushCancel || !canSend()) return
    flushCancel = schedule(flush, coalesceMs)
  }

  const releaseHold = () => {
    if (holdUntil !== null && seq >= holdUntil) holdUntil = null
  }

  return {
    get clientId() {
      return clientId
    },

    getState(): SyncSnapshot {
      return {
        mode,
        synced,
        seq,
        sessionId,
        confirmed,
        visible,
        inflight,
        queued,
        pending: queued.length + (inflight?.changes.length ?? 0),
      }
    },

    /** Called for every non-local change of `visible` (remote commits, acknowledgements, sessions). */
    subscribe(listener: (update: SyncUpdate) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** Called when the engine needs a fresh session (a seq gap, a commit that does not apply). */
    onResync(listener: () => void) {
      resyncListeners.add(listener)
      return () => {
        resyncListeners.delete(listener)
      }
    },

    /** `live`: local edits queue until a session arrives, then sync. `solo`: edits apply directly. */
    setMode(next: SyncMode) {
      if (next === mode) return
      mode = next
      if (next === 'solo') {
        // Keep what the user sees. Nothing is pending any more.
        confirmed = visible
        inflight = null
        queued = []
        synced = false
        holdUntil = null
        flushCancel?.()
        flushCancel = null
        retryCancel?.()
        retryCancel = null
      }
    },

    /** The network function. `null` stops sending (changes keep queueing). */
    setTransport(next: ((request: LiveCommitRequest) => void) | null) {
      send = next
      scheduleFlush()
    },

    /** The server may assign another id. Set it before any batch goes out. */
    setClientId(next: string) {
      clientId = next
    },

    /** Applies a local edit to `visible` at once. In live mode it also queues for the server. */
    local(ops: Operation[], tag: string): LocalResult {
      const result = applyLocal(visible, ops)
      if (!result.ok) return result
      visible = result.layout
      if (mode === 'solo') {
        confirmed = result.layout
        return result
      }
      if (result.ops.length > 0) queued = [...queued, { tag, ops: result.ops, attempts: 0 }]
      scheduleFlush()
      return result
    },

    /** An external layout (the Payload form). Accepted in solo mode only: in live mode the session wins. */
    load(layout: Layout): boolean {
      if (mode === 'live') return false
      confirmed = layout
      visible = layout
      return true
    },

    /**
     * Full state from the server: the first event on connect, or the answer to a resync.
     * `id` is the server's session id. A new id means the server started a new session (restart).
     */
    session(nextSeq: number, layout: Layout, id?: string | null) {
      mode = 'live'
      const newSession = id ? sessionId !== null && id !== sessionId : nextSeq < seq
      if (id) sessionId = id
      if (inflight) {
        if (newSession) {
          // The server lost its session (restart). Send the batch again on the new one.
          queued = [...inflight.changes, ...queued]
          inflight = null
        } else if (inflight.ackSeq !== null && nextSeq >= inflight.ackSeq) {
          // The batch is part of this layout.
          inflight = null
        }
        // Otherwise wait: the response or the echo tells whether the batch is in.
      }
      confirmed = layout
      seq = nextSeq
      synced = true
      holdUntil = null
      const dropped = rebase()
      emit({ layout: visible, reason: 'session', dropped })
      scheduleFlush()
    },

    /** A commit from the server stream, in seq order. */
    commit(event: LiveCommitEvent) {
      if (mode !== 'live' || !synced) return
      if (event.seq <= seq) return
      if (event.seq !== seq + 1) {
        requestResync()
        return
      }
      const next = applyAll(confirmed, event.ops)
      if (!next) {
        // The server applied it, so our confirmed layout is wrong. Start over from a session.
        requestResync()
        return
      }
      confirmed = next
      seq = event.seq
      releaseHold()
      const own = inflight !== null && event.clientId === clientId && event.batchId === inflight.batchId
      if (own && inflight) {
        const sentOps = inflight.changes.flatMap((c) => c.ops)
        inflight = null
        if (sameOps(sentOps, event.ops)) {
          // `visible` already is confirmed + queued. Keep the same object: nothing re-renders.
          scheduleFlush()
          return
        }
        const dropped = rebase()
        emit({ layout: visible, reason: 'own', dropped })
        scheduleFlush()
        return
      }
      const dropped = rebase()
      emit({ layout: visible, reason: 'remote', dropped, commit: event })
      scheduleFlush()
    },

    /** The HTTP answer to a commit request. */
    response(batchId: string, response: LiveCommitResponse) {
      if (!inflight || inflight.batchId !== batchId) return
      if (response.ok) {
        if (response.seq <= seq) {
          // A session already includes the batch, and its echo will not come.
          inflight = null
          const dropped = rebase()
          emit({ layout: visible, reason: 'own', dropped })
          scheduleFlush()
          return
        }
        inflight.ackSeq = response.seq
        return
      }
      const rejected = inflight
      inflight = null
      if (response.seq < rejected.baseSeq) {
        // The server's session is older than ours (it restarted): get a fresh session first.
        queued = [...rejected.changes, ...queued]
        requestResync()
        return
      }
      // Rejected while sent alone after an earlier rejection: this change cannot apply. Drop it.
      const lone = rejected.changes.length === 1 && rejected.changes[0].attempts > 0
      const droppedNow = lone ? [rejected.changes[0].tag] : []
      if (!lone) {
        queued = [...rejected.changes.map((c) => ({ ...c, attempts: c.attempts + 1 })), ...queued]
        // Re-check the changes on the same state the server rejected them on.
        holdUntil = response.seq
        releaseHold()
      }
      const dropped = [...droppedNow, ...rebase()]
      emit({ layout: visible, reason: 'rejected', dropped, error: dropped.length > 0 ? response.error : undefined })
      scheduleFlush()
    },

    /** The request failed (network, server error). The batch is sent again after `retryMs`. */
    sendFailed(batchId: string, retryMs: number) {
      if (!inflight || inflight.batchId !== batchId) return
      queued = [...inflight.changes, ...queued]
      inflight = null
      retryCancel?.()
      retryCancel = schedule(() => {
        retryCancel = null
        scheduleFlush()
      }, retryMs)
    },

    /** The stream dropped. Nothing is sent until the next session or resumed stream. */
    disconnected() {
      synced = false
      flushCancel?.()
      flushCancel = null
    },

    /** The stream resumed without a session (commits are replayed). Sending may continue. */
    resumed() {
      if (mode !== 'live') return
      synced = true
      scheduleFlush()
    },
  }
}
