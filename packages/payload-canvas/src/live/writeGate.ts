// One save at a time per builder document.
//
// Payload's update reads the newest version, merges the request's data onto it and writes the
// whole version back. Two saves of one document that overlap therefore lose a change: the live
// session saves only the layout, the settings drawer's autosave saves the other fields, and the
// one that read first writes the other's fields back with their old values. The write gate makes
// every update of a builder document wait until the update before it has ended.
//
// When a save ends comes from the database's own answer, never from a guess:
// - With a transaction: when the adapter's `commitTransaction` or `rollbackTransaction` for that
//   transaction settles. `installTransactionSignals` wraps the two methods of `payload.db` once (the
//   plugin's `onInit`) and tells the gate the outcome: committed, or not.
// - Without a transaction (an adapter without them): the write is stored when the operation
//   succeeds, so its `afterOperation` ends it. A failed REST request ends it in `afterError`. A
//   failed Local API call has no hook, so `installLocalApiBoundary` wraps `payload.update` (the
//   plugin's `onInit`): the call runs in its own async context (`AsyncLocalStorage`), every update
//   it runs registers with it (the innermost call, also for nested calls and for parallel calls
//   that share one `req`), and when the call's promise settles, its own updates that never reached
//   `afterOperation` failed: their holds end at once. Retrying with the same `req`
//   works as in Payload. A failed GraphQL request ends in the config's `afterError` (`failRequest`).
//   Only a request abandoned with neither signal ends when it is garbage collected (a
//   `FinalizationRegistry`), which can only happen after its operation is over; the gate keeps no
//   strong reference to a request for that reason.
// Nothing ends a hold by time. A save that waits gives up after a while with a 409 ("another save
// of this document is still running"): the waiter fails clearly, the owner keeps the gate.
//
// One request may hold the gates of several documents (a hook that saves another document with the
// same `req`, in the same transaction). An update joins a hold only within the same active
// transaction, or the same running operation without one, or inside `run`; a later update on a
// reused request takes the gate again. A wait that would close a cycle is refused at once (409).
//
// `afterCommit` queues work on the operation that runs it: with a transaction it runs when that
// transaction committed, never after a rollback or a failed commit; without one, when the
// operation succeeded. The events that tell editors a save happened use it, so nobody reloads
// values that are not stored.
//
// In-process only, like the live sessions (one server process; see docs/architecture.md section 12).

import { AsyncLocalStorage } from 'node:async_hooks'

import { APIError, type CollectionAfterErrorHook, type CollectionAfterOperationHook, type CollectionBeforeOperationHook } from 'payload'

/** How long a save waits for the gate before it gives up with a 409. */
const WAIT_MS = 30_000

type Hold = {
  key: string
  /** The request that holds it. Weak: a collected request ends its hold. */
  req: WeakRef<object>
  /** The transaction the hold belongs to, or null. */
  transaction: unknown
  /** `run`: the plugin's own read and save; any update of the request inside it joins. */
  kind: 'op' | 'run'
  /** The operation that took it (without a transaction its end ends the hold). */
  owner: Op | null
  released: boolean
  release: () => void
}

/** One update operation of a builder document. */
type Op = {
  key: string
  req: WeakRef<object>
  hold: Hold
  transaction: unknown
  ended: boolean
  /** Work to run once the save is stored. */
  callbacks: Array<() => void>
}

export type WriteGateOptions = {
  waitMs?: number
  logger?: { error?(message: string, error?: unknown): void }
}

export type WriteGate = {
  /**
   * Runs `task` while it holds the document's gate. Updates inside it that get the same `req`
   * join the hold. Rejects with a 409 when the gate stays busy.
   */
  run<T>(key: string, req: object, task: () => Promise<T>): Promise<T>
  /** True while `req` holds a gate. */
  holds(req: object): boolean
  /**
   * Runs `fn` once the update of `key` that `req` runs now is stored: after its transaction
   * committed, or after the operation succeeded without one. Never after a rollback or a failed
   * commit. Outside a gated update it runs at once.
   */
  afterCommit(req: object, key: string, fn: () => void): void
  /** The adapter committed (`committed: true`), rolled back, or failed to commit a transaction. */
  transactionEnded(transaction: unknown, committed: boolean): void
  /**
   * Runs one Local API call in its own async context. When it settles, the updates it ran (not
   * those of a call inside it, nor of another call at the same time) that never reached
   * `afterOperation` failed: their holds end and their work goes.
   */
  localCall<T>(call: () => Promise<T>): Promise<T>
  /** A request failed (Payload's config-level `afterError`: REST, GraphQL): its updates without a transaction end. */
  failRequest(req: object): void
  /** Hooks that put every update of `collection` through the gate. */
  hooks(collection: string): {
    beforeOperation: CollectionBeforeOperationHook
    afterOperation: CollectionAfterOperationHook
    afterError: CollectionAfterErrorHook
  }
  /** Documents with a held or waiting gate. For tests. */
  size(): number
}

/** The gate key of a document. Number and text ids of one document share a key. */
export const writeKey = (collection: string, id: string | number) => `${collection}:${String(id)}`

/** A transaction id, or null for none (Payload leaves a Promise there when the adapter began none). */
const transactionOf = (req: object) => {
  const value = (req as { transactionID?: unknown } | undefined)?.transactionID
  return value === undefined || value === null || value instanceof Promise ? null : value
}

/**
 * The function that opens a gate again. Made outside the function that waits for the gate: V8
 * closures of one function share one context, and the waiting closures hold the request. A
 * `release` made there would keep every request alive, and no request could ever be collected.
 */
function releaser(tails: Map<string, Promise<void>>, key: string, tail: Promise<void>, open: () => void): () => void {
  return () => {
    open()
    if (tails.get(key) === tail) tails.delete(key)
  }
}

/** The document of a version (`restoreVersion` gets the version's id), or undefined. */
async function versionParent(req: object, collection: string, versionId: unknown): Promise<unknown> {
  if (typeof versionId !== 'string' && typeof versionId !== 'number') return undefined
  const db = (req as { payload?: { db?: { findVersions?: (args: Record<string, unknown>) => Promise<{ docs: { parent?: unknown }[] }> } } }).payload?.db
  if (!db?.findVersions) return undefined
  const { docs } = await db.findVersions({ collection, where: { id: { equals: versionId } }, limit: 1, pagination: false, req })
  const parent = docs[0]?.parent
  return parent !== null && typeof parent === 'object' ? (parent as { id?: unknown }).id : parent
}

/** The answer when a save cannot get the document's gate. */
function busy(key: string, why: string): APIError {
  return new APIError(`Not saved: another save of this document is still running (${why}). Try again in a moment.`, 409, { key }, true)
}

export function createWriteGate(options: WriteGateOptions = {}): WriteGate {
  const waitMs = options.waitMs ?? WAIT_MS
  const tails = new Map<string, Promise<void>>()
  /** The hold of each key. */
  const holders = new Map<string, Hold>()
  /** The live holds of each request, by key. */
  const byReq = new WeakMap<object, Map<string, Hold>>()
  /** The key a request waits for. */
  const waiting = new WeakMap<object, string>()
  /** The running operations of each request, by key, innermost last. */
  const running = new WeakMap<object, Map<string, Op[]>>()
  /** The Local API call an update runs in: the innermost `localCall` around it. */
  const calls = new AsyncLocalStorage<{ ops: Op[] }>()
  /** Operations by their `args` (Payload passes the same object to `afterOperation`). */
  const byArgs = new WeakMap<object, Op>()
  /** Per open transaction: its holds, its running operations, and the work of its finished ones. */
  const transactions = new Map<unknown, { holds: Set<Hold>; ops: Set<Op>; callbacks: Array<() => void> }>()
  /** A request collected while it held a gate: its save is over (a failed Local API call). */
  const collected = new FinalizationRegistry<Hold>((hold) => finish(hold))

  const runAll = (callbacks: Array<() => void>) => {
    for (const fn of callbacks.splice(0)) {
      try {
        fn()
      } catch (error) {
        options.logger?.error?.('[websiteBuilder] An after-commit task failed.', error)
      }
    }
  }

  function finish(hold: Hold) {
    if (hold.released) return
    hold.released = true
    collected.unregister(hold)
    const req = hold.req.deref()
    const held = req ? byReq.get(req) : undefined
    if (held?.get(hold.key) === hold) held.delete(hold.key)
    if (holders.get(hold.key) === hold) holders.delete(hold.key)
    hold.release()
  }

  const transactionRecord = (transaction: unknown) => {
    let record = transactions.get(transaction)
    if (!record) {
      record = { holds: new Set(), ops: new Set(), callbacks: [] }
      transactions.set(transaction, record)
    }
    return record
  }

  /** Takes an operation off its request's running list. */
  const leave = (op: Op) => {
    op.ended = true
    const req = op.req.deref()
    const list = req ? running.get(req)?.get(op.key) : undefined
    const index = list ? list.lastIndexOf(op) : -1
    if (list && index !== -1) list.splice(index, 1)
  }

  /** An operation that ended without reaching afterOperation: no work, and without a transaction its hold ends. */
  const fail = (op: Op) => {
    if (op.ended) return
    op.callbacks.length = 0
    leave(op)
    if (op.transaction === null && op.hold.owner === op) finish(op.hold)
  }

  /** True when `req` waiting for `key` would close a cycle of waits. */
  const wouldDeadlock = (req: object, key: string) => {
    const seen = new Set<object>()
    for (let holder = holders.get(key); holder; ) {
      const owner = holder.req.deref()
      if (!owner) return false
      if (owner === req) return true
      if (seen.has(owner)) return false
      seen.add(owner)
      const next = waiting.get(owner)
      holder = next ? holders.get(next) : undefined
    }
    return false
  }

  /** Waits for the gate of `key`, as `req`. Resolves with the hold; rejects with a 409 when it stays busy. */
  const take = (key: string, req: object, transaction: unknown, kind: Hold['kind']): Promise<Hold> => {
    if (wouldDeadlock(req, key)) return Promise.reject(busy(key, 'it waits for a document this save holds'))
    const previous = tails.get(key) ?? Promise.resolve()
    let open!: () => void
    const mine = new Promise<void>((resolve) => {
      open = resolve
    })
    const tail = previous.then(() => mine)
    tails.set(key, tail)
    const release = releaser(tails, key, tail, open)
    let gaveUp = false
    waiting.set(req, key)
    return new Promise<Hold>((resolve, reject) => {
      const timer = setTimeout(() => {
        gaveUp = true
        if (waiting.get(req) === key) waiting.delete(req)
        reject(busy(key, `waited ${Math.round(waitMs / 1000)} s`))
      }, waitMs)
      ;(timer as { unref?: () => void }).unref?.()
      void previous.then(() => {
        clearTimeout(timer)
        // A waiter that gave up lets the next one go at once.
        if (gaveUp) {
          release()
          return
        }
        if (waiting.get(req) === key) waiting.delete(req)
        const hold: Hold = { key, req: new WeakRef(req), transaction, kind, owner: null, released: false, release }
        holders.set(key, hold)
        const held = byReq.get(req) ?? new Map<string, Hold>()
        held.set(key, hold)
        byReq.set(req, held)
        if (kind === 'op') collected.register(req, hold, hold)
        if (transaction !== null) transactionRecord(transaction).holds.add(hold)
        resolve(hold)
      })
    })
  }

  /** The live hold an update of `key` may join: the same transaction, the same running operation, or `run`. */
  const joinable = (req: object, key: string, transaction: unknown): Hold | null => {
    const hold = byReq.get(req)?.get(key)
    if (!hold || hold.released) return null
    if (hold.kind === 'run') return hold
    if (transaction !== null) return hold.transaction === transaction ? hold : null
    return hold.transaction === null && hold.owner !== null && !hold.owner.ended ? hold : null
  }

  return {
    async run(key, req, task) {
      if (joinable(req, key, transactionOf(req))) return task()
      const hold = await take(key, req, null, 'run')
      try {
        return await task()
      } finally {
        finish(hold)
      }
    },

    holds: (req) => [...(byReq.get(req)?.values() ?? [])].some((hold) => !hold.released),

    afterCommit(req, key, fn) {
      const op = running.get(req)?.get(key)?.at(-1)
      if (op && !op.ended) {
        op.callbacks.push(fn)
        return
      }
      // An operation the gate does not run (none of its updates): still never before the commit
      // of the request's transaction.
      const transaction = transactionOf(req)
      if (transaction !== null) {
        transactionRecord(transaction).callbacks.push(fn)
        return
      }
      fn()
    },

    transactionEnded(transaction, committed) {
      const record = transactions.get(transaction)
      if (!record) return
      transactions.delete(transaction)
      // Operations that never reached afterOperation failed: their work goes.
      for (const op of record.ops) {
        op.callbacks.length = 0
        leave(op)
      }
      const callbacks = record.callbacks.splice(0)
      if (committed) runAll(callbacks)
      for (const hold of record.holds) finish(hold)
    },

    failRequest(req) {
      for (const ops of running.get(req)?.values() ?? []) {
        for (const op of ops.slice()) if (op.transaction === null) fail(op)
      }
    },

    async localCall(call) {
      const record = { ops: [] as Op[] }
      try {
        return await calls.run(record, call)
      } finally {
        // Saves with a transaction end with its commit or rollback; the others end here.
        for (const op of record.ops) if (op.transaction === null) fail(op)
      }
    },

    hooks(collection) {
      return {
        beforeOperation: async ({ args, operation, req }) => {
          let id = (args as { id?: unknown }).id
          // Restoring a version writes its document: its gate, by the version's parent.
          if (operation === 'restoreVersion') id = await versionParent(req, collection, id)
          // Updates by id only: a bulk update (`where`) has no single document to wait for.
          if ((operation !== 'update' && operation !== 'restoreVersion') || (typeof id !== 'string' && typeof id !== 'number')) return args
          const key = writeKey(collection, id)
          const transaction = transactionOf(req)
          const hold = joinable(req, key, transaction) ?? (await take(key, req, transaction, 'op'))
          const op: Op = { key, req: new WeakRef(req), hold, transaction, ended: false, callbacks: [] }
          if (hold.kind === 'op' && hold.owner === null) hold.owner = op
          if (transaction !== null) transactionRecord(transaction).ops.add(op)
          const ops = running.get(req) ?? new Map<string, Op[]>()
          ops.set(key, [...(ops.get(key) ?? []), op])
          running.set(req, ops)
          calls.getStore()?.ops.push(op)
          byArgs.set(args as object, op)
          return args
        },
        afterOperation: ({ args, result }) => {
          const op = byArgs.get(args as object)
          if (!op) return result
          byArgs.delete(args as object)
          leave(op)
          if (op.transaction === null) {
            // Stored now: there is no commit to wait for.
            runAll(op.callbacks)
            if (op.hold.owner === op) finish(op.hold)
            return result
          }
          // The commit follows: the work waits for the adapter's answer.
          const record = transactions.get(op.transaction)
          if (record) {
            record.ops.delete(op)
            record.callbacks.push(...op.callbacks.splice(0))
          }
          return result
        },
        afterError: ({ req }) => {
          // A failed REST request. Saves with a transaction end with its rollback.
          for (const ops of running.get(req)?.values() ?? []) {
            for (const op of ops.slice()) if (op.transaction === null) fail(op)
          }
        },
      }
    },

    size: () => tails.size,
  }
}

/** The part of a database adapter the signals wrap. */
export type TransactionAdapter = {
  commitTransaction?: (id: never) => Promise<unknown>
  rollbackTransaction?: (id: never) => Promise<unknown>
}

const WRAPPED = Symbol.for('payload-canvas/transaction-signals')

/**
 * Tells the gate when the adapter committed or rolled back a transaction, from the adapter's own
 * answer: wraps `commitTransaction` and `rollbackTransaction` of `payload.db` once. A commit that
 * throws counts as not committed.
 */
export function installTransactionSignals(db: TransactionAdapter, gate: WriteGate): void {
  const target = db as TransactionAdapter & { [WRAPPED]?: true }
  if (target[WRAPPED]) return
  target[WRAPPED] = true
  const commit = db.commitTransaction?.bind(db)
  const rollback = db.rollbackTransaction?.bind(db)
  if (commit) {
    db.commitTransaction = (async (id: never) => {
      let committed = false
      try {
        const result = await commit(id)
        committed = true
        return result
      } finally {
        gate.transactionEnded(id, committed)
      }
    }) as TransactionAdapter['commitTransaction']
  }
  if (rollback) {
    db.rollbackTransaction = (async (id: never) => {
      try {
        return await rollback(id)
      } finally {
        gate.transactionEnded(id, false)
      }
    }) as TransactionAdapter['rollbackTransaction']
  }
}

/** The part of the Payload instance the Local API boundary wraps. */
export type LocalApi = { update: (options: Record<string, unknown>) => Promise<unknown> }

const BOUNDARY = Symbol.for('payload-canvas/local-api-boundary')

/** Gives the gate the end of every Local API update: wraps `payload.update` once. The call itself is unchanged. */
export function installLocalApiBoundary(payload: LocalApi, gate: WriteGate): void {
  const target = payload as LocalApi & { [BOUNDARY]?: true }
  if (target[BOUNDARY]) return
  target[BOUNDARY] = true
  const update = payload.update.bind(payload)
  payload.update = (options) => gate.localCall(() => update(options))
}

const GATE_KEY = Symbol.for('payload-canvas/write-gate-v4')

/** The process-wide write gate. Kept on `globalThis`, so a dev hot reload keeps it. */
export function defaultWriteGate(): WriteGate {
  const store = globalThis as unknown as Record<symbol, WriteGate | undefined>
  store[GATE_KEY] ??= createWriteGate({ logger: { error: (message, error) => console.error(message, error) } })
  return store[GATE_KEY]
}
