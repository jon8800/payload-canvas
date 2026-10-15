import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'

import { createWriteGate, installLocalApiBoundary, installTransactionSignals, writeKey, type WriteGate } from './writeGate'

setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc') as () => void

type Doc = Record<string, unknown>
type Hooks = ReturnType<WriteGate['hooks']>

const tick = () => new Promise((resolve) => setImmediate(resolve))
const ticks = async (n: number) => {
  for (let i = 0; i < n; i++) await tick()
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits until `test` holds. */
async function until(test: () => boolean, ms = 1000) {
  const end = Date.now() + ms
  while (!test()) {
    if (Date.now() > end) throw new Error('Timed out')
    await sleep(2)
  }
}

/** No gate: what the plugin did before. */
const NO_GATE: Hooks = {
  beforeOperation: (async ({ args }: { args: unknown }) => args) as never,
  afterOperation: (({ result }: { result: unknown }) => result) as never,
  afterError: (() => undefined) as never,
}

/**
 * A fake database adapter with transactions, wrapped by `installTransactionSignals` as the
 * plugin's `onInit` does. `failCommit`: the next commit throws.
 */
function fakeAdapter(gate: WriteGate | null) {
  let count = 0
  const adapter = {
    failCommit: false,
    beginTransaction: async () => `tx${++count}`,
    commitTransaction: async (_id: never) => {
      if (adapter.failCommit) {
        adapter.failCommit = false
        throw new Error('commit failed')
      }
    },
    rollbackTransaction: async (_id: never) => {},
  }
  if (gate) installTransactionSignals(adapter, gate)
  return adapter
}

type UpdateInput = {
  id: string | number
  data: Doc
  req?: Record<string, unknown>
  /** Throws after afterChange, before afterOperation (a later hook): the save fails. */
  fail?: boolean
  /** A slow hook between the read and the write. */
  slowMs?: number
  /** Payload's afterChange: inside the transaction, before the commit. */
  afterChange?: (req: object) => void
  /** More saves inside this one (a hook), with the same request. */
  nested?: (req: Record<string, unknown>) => Promise<unknown>
  /** REST: Payload runs `afterError` for a failed request. Local API: no hook. */
  rest?: boolean
}

/**
 * A model of Payload 3.90's `updateByID`: begin a transaction on the request unless it has one,
 * `beforeOperation`, read the committed document, hooks, write, `afterChange`, `afterOperation`,
 * then the adapter's commit (which may throw) and `delete req.transactionID`; on an error the
 * adapter's rollback. Reads see committed data only. `adapter: null`: no transactions (each write
 * is stored at once).
 */
function fakeCollection(initial: Doc, adapter: ReturnType<typeof fakeAdapter> | null) {
  let committed: Doc = structuredClone(initial)
  return {
    get doc() {
      return committed
    },
    async update(hooks: Hooks, input: UpdateInput) {
      const req = input.req ?? {}
      let own = false
      if (adapter && !req.transactionID) {
        req.transactionID = await adapter.beginTransaction()
        own = true
      }
      try {
        let args: Doc = { id: input.id, data: input.data, req }
        args = ((await hooks.beforeOperation({ args, operation: 'update', req, context: {} } as never)) as Doc) ?? args
        const original = structuredClone(committed)
        await ticks(2)
        if (input.slowMs) await sleep(input.slowMs)
        if (input.nested) await input.nested(req)
        const pending = { ...original, ...input.data }
        if (!adapter) committed = pending
        input.afterChange?.(req)
        if (input.fail) throw new Error('Validation failed')
        const result = await hooks.afterOperation({ args, operation: 'updateByID', req, result: pending } as never)
        if (adapter) {
          // The database holds the write once the commit succeeds (a nested save: with the outer one; simplified).
          const before = committed
          committed = pending
          if (own) {
            try {
              await adapter.commitTransaction(req.transactionID as never)
            } catch (error) {
              committed = before
              throw error
            }
            delete req.transactionID
          }
        }
        return result as Doc
      } catch (error) {
        if (own && req.transactionID) {
          await adapter!.rollbackTransaction(req.transactionID as never)
          delete req.transactionID
        }
        if (input.rest) await hooks.afterError({ req, error } as never)
        throw error
      }
    },
  }
}

describe('write gate', () => {
  it('without the gate, a layout save and a settings save that overlap lose one change', async () => {
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, fakeAdapter(null))
    await Promise.all([pages.update(NO_GATE, { id: 1, data: { layout: 'B' } }), pages.update(NO_GATE, { id: 1, data: { title: 'New' } })])
    assert.ok(pages.doc.layout !== 'B' || pages.doc.title !== 'New')
  })

  it('keeps both changes when a session save and a drawer autosave overlap', async () => {
    const gate = createWriteGate()
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, fakeAdapter(gate))
    const hooks = gate.hooks('pages')
    // The session saves with a number id, the drawer's REST request with the text of it.
    await Promise.all([
      pages.update(hooks, { id: 1, data: { layout: 'B' } }),
      pages.update(hooks, { id: '1', data: { title: 'New' } }),
      pages.update(hooks, { id: 1, data: { layout: 'C' } }),
    ])
    assert.deepEqual(pages.doc, { id: 1, layout: 'C', title: 'New' })
    assert.equal(gate.size(), 0)
  })

  it('lets saves of other documents run at the same time', async () => {
    const gate = createWriteGate()
    const order: string[] = []
    let release!: () => void
    const blocker = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = gate.run(writeKey('pages', 1), {}, async () => {
      order.push('pages:1 start')
      await blocker
      order.push('pages:1 end')
    })
    await tick()
    await gate.run(writeKey('pages', 2), {}, async () => {
      order.push('pages:2')
    })
    release()
    await slow
    assert.deepEqual(order, ['pages:1 start', 'pages:2', 'pages:1 end'])
  })

  it('keeps the gate of a slow save with a transaction until the adapter commits', async () => {
    const gate = createWriteGate()
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, fakeAdapter(gate))
    const hooks = gate.hooks('pages')
    const slow = pages.update(hooks, { id: 1, data: { title: 'New' }, slowMs: 120 })
    await ticks(3)
    await Promise.all([slow, pages.update(hooks, { id: 1, data: { layout: 'B' } })])
    assert.deepEqual(pages.doc, { id: 1, layout: 'B', title: 'New' })
  })

  it('keeps the gate of a slow save without a transaction until the operation ends: nothing expires it', async () => {
    const gate = createWriteGate({ waitMs: 2000 })
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, null)
    const hooks = gate.hooks('pages')
    const slow = pages.update(hooks, { id: 1, data: { title: 'New' }, slowMs: 150 })
    await ticks(3)
    const started = Date.now()
    await Promise.all([slow, pages.update(hooks, { id: 1, data: { layout: 'B' } })])
    assert.ok(Date.now() - started >= 120, 'the other save waited for the slow one')
    assert.deepEqual(pages.doc, { id: 1, layout: 'B', title: 'New' })
    assert.equal(gate.size(), 0)
  })

  it('without a transaction, a failed Local API save ends when its call settles: a retry with the same request works, and so does everyone else', async () => {
    const gate = createWriteGate({ waitMs: 5000 })
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, null)
    const hooks = gate.hooks('pages')
    // The caller keeps its request, as code that catches a validation error and retries does.
    const req: Record<string, unknown> = {}
    await assert.rejects(gate.localCall(() => pages.update(hooks, { id: 1, data: { title: '' }, req, fail: true })), /Validation failed/)
    assert.equal(gate.size(), 0, 'the failed save gave the gate back at once')
    await gate.localCall(() => pages.update(hooks, { id: 1, data: { title: 'Fixed' }, req }))
    assert.equal(gate.size(), 0, 'the retry with the same request gave it back too')
    const started = Date.now()
    await gate.localCall(() => pages.update(hooks, { id: 1, data: { layout: 'B' } }))
    assert.ok(Date.now() - started < 500, 'another request saves at once')
    assert.deepEqual(pages.doc, { id: 1, layout: 'B', title: 'Fixed' })
  })

  it('keeps the gate of a slow call while a parallel call on the same request ends, and a failure stays in its own call', async () => {
    const gate = createWriteGate({ waitMs: 5000 })
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, null)
    const notes = fakeCollection({ id: 2, flag: true }, null)
    const hooks = gate.hooks('pages')
    const req: Record<string, unknown> = {}
    let resume!: () => void
    const paused = new Promise<void>((resolve) => {
      resume = resolve
    })
    let slowEnded = false
    // Two Local API calls at the same time with one request: a slow save of document 1, a fast one of document 2.
    const slow = gate
      .localCall(() => pages.update(hooks, { id: 1, data: { title: 'Slow' }, req, nested: () => paused }))
      .then(() => {
        slowEnded = true
      })
    await ticks(3)
    await gate.localCall(() => notes.update(hooks, { id: 2, data: { flag: false }, req }))
    // A failing parallel call on the same request ends only its own save.
    await assert.rejects(gate.localCall(() => notes.update(hooks, { id: 2, data: { flag: true }, req, fail: true })))
    // Document 1 is still held: another save waits for the slow one.
    let peerDone = false
    const peer = gate.localCall(() => pages.update(hooks, { id: 1, data: { layout: 'B' } })).then(() => {
      peerDone = true
      assert.equal(slowEnded, true, 'the other save ran only after the slow one ended')
    })
    await sleep(30)
    assert.equal(peerDone, false, 'the gate of the slow save is still held')
    resume()
    await Promise.all([slow, peer])
    assert.deepEqual(pages.doc, { id: 1, layout: 'B', title: 'Slow' }, 'no change is lost')
    assert.equal(gate.size(), 0)
  })

  it('wraps payload.update so every Local API update gets that end, nested calls on one request included', async () => {
    const gate = createWriteGate({ waitMs: 5000 })
    const pages = fakeCollection({ id: 1, title: 'Old' }, null)
    const notes = fakeCollection({ id: 2, flag: true }, null)
    const hooks = gate.hooks('pages')
    const payload = {
      async update(options: Record<string, unknown>) {
        const target = options.id === 1 ? pages : notes
        return target.update(hooks, { id: options.id as number, data: options.data as Doc, req: options.req as Record<string, unknown>, fail: Boolean(options.fail), nested: options.nested as never })
      },
    }
    installLocalApiBoundary(payload, gate)
    // A failing outer save whose hook saves another document with the same request: the nested save
    // succeeds, the outer one fails, and both documents are free afterwards.
    const req: Record<string, unknown> = {}
    await assert.rejects(payload.update({ id: 1, data: { title: 'Bad' }, req, fail: true, nested: (r: object) => payload.update({ id: 2, data: { flag: false }, req: r }) }))
    assert.equal(gate.size(), 0)
    // Without a request of its own, the call still gets one: the failure ends at once.
    await assert.rejects(payload.update({ id: 1, data: { title: 'Bad' }, fail: true }))
    assert.equal(gate.size(), 0)
    await payload.update({ id: 1, data: { title: 'Good' } })
    assert.equal(pages.doc.title, 'Good')
  })

  it('ends the saves of a failed request in the config afterError (GraphQL, REST)', async () => {
    const gate = createWriteGate({ waitMs: 5000 })
    const pages = fakeCollection({ id: 1, title: 'Old' }, null)
    const hooks = gate.hooks('pages')
    const req: Record<string, unknown> = {}
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Bad' }, req, fail: true }))
    assert.equal(gate.size(), 1)
    gate.failRequest(req)
    assert.equal(gate.size(), 0)
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Bad' }, fail: true, rest: true }))
    assert.equal(gate.size(), 0, 'a failed REST request ends in the collection afterError')
  })

  it('ends the save of a request abandoned with no signal at all once it is collected', async () => {
    const gate = createWriteGate({ waitMs: 5000 })
    const pages = fakeCollection({ id: 1, title: 'Old' }, null)
    const hooks = gate.hooks('pages')
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Bad' }, fail: true }))
    assert.equal(gate.size(), 1)
    await until(() => {
      gc()
      return gate.size() === 0
    }, 3000)
  })

  it('opens the gate when a failed save rolls back its transaction', async () => {
    const gate = createWriteGate()
    const pages = fakeCollection({ id: 1, title: 'Old' }, fakeAdapter(gate))
    const hooks = gate.hooks('pages')
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Bad' }, fail: true }))
    assert.equal(gate.size(), 0)
    await pages.update(hooks, { id: 1, data: { title: 'Good' } })
    assert.equal(pages.doc.title, 'Good')
  })

  it('takes the gate again for a second save on a reused request: it never joins the finished one', async () => {
    const gate = createWriteGate()
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, fakeAdapter(gate))
    const hooks = gate.hooks('pages')
    const req: Record<string, unknown> = {}
    await pages.update(hooks, { id: 1, data: { title: 'First' }, req })
    // The second save on the same request starts at once and holds the gate in a slow hook.
    const second = pages.update(hooks, { id: 1, data: { title: 'Second' }, req, slowMs: 80 })
    await ticks(3)
    const peer = pages.update(hooks, { id: 1, data: { layout: 'B' } })
    await Promise.all([second, peer])
    // The other save read after the second one committed: both changes are there.
    assert.deepEqual(pages.doc, { id: 1, layout: 'B', title: 'Second' })
  })

  it('makes a save of a second document inside a save wait for that document, so nothing overlaps', async () => {
    const gate = createWriteGate()
    const adapter = fakeAdapter(gate)
    const a = fakeCollection({ id: 'a', flag: true }, adapter)
    const b = fakeCollection({ id: 'b', flag: true, note: 'Old' }, adapter)
    const hooks = gate.hooks('pages')
    const other = b.update(hooks, { id: 'b', data: { note: 'New' }, slowMs: 60 })
    await ticks(3)
    const save = a.update(hooks, { id: 'a', data: { flag: true }, nested: (req) => b.update(hooks, { id: 'b', data: { flag: false }, req }) })
    await Promise.all([other, save])
    assert.deepEqual(b.doc, { id: 'b', flag: false, note: 'New' })
    assert.equal(gate.size(), 0)
  })

  it('refuses at once, with a 409, a wait that would close a cycle, and the other save completes', async () => {
    const gate = createWriteGate()
    const adapter = fakeAdapter(gate)
    const a = fakeCollection({ id: 'a', flag: true }, adapter)
    const b = fakeCollection({ id: 'b', flag: true }, adapter)
    const hooks = gate.hooks('pages')
    const crossSave = (own: typeof a, other: typeof b, id: string, otherId: string) =>
      own.update(hooks, { id, data: { flag: true }, slowMs: 20, nested: (req) => other.update(hooks, { id: otherId, data: { flag: false }, req }) })
    const started = Date.now()
    const results = await Promise.allSettled([crossSave(a, b, 'a', 'b'), crossSave(b, a, 'b', 'a')])
    assert.ok(Date.now() - started < 1000, 'nobody waited for a timeout')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    assert.equal(failed.length, 1)
    assert.equal((failed[0].reason as { status?: number }).status, 409)
    assert.match(String((failed[0].reason as Error).message), /another save of this document is still running/)
    await until(() => gate.size() === 0)
  })

  it('gives up waiting after a time with a 409 instead of taking the gate from its owner', async () => {
    const gate = createWriteGate({ waitMs: 30 })
    const pages = fakeCollection({ id: 1, title: 'Old' }, fakeAdapter(gate))
    const hooks = gate.hooks('pages')
    const slow = pages.update(hooks, { id: 1, data: { title: 'New' }, slowMs: 100 })
    await ticks(3)
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Lost?' } }), (error: { status?: number }) => error.status === 409)
    await slow
    assert.equal(pages.doc.title, 'New')
    await pages.update(hooks, { id: 1, data: { title: 'Later' } })
    assert.equal(pages.doc.title, 'Later')
  })

  it('runs after-commit work only after the adapter committed, never after a rollback or a failed commit', async () => {
    const gate = createWriteGate()
    const adapter = fakeAdapter(gate)
    const pages = fakeCollection({ id: 1, title: 'Old' }, adapter)
    const hooks = gate.hooks('pages')
    const seen: string[] = []
    const announce = (label: string) => (req: object) => gate.afterCommit(req, writeKey('pages', 1), () => seen.push(`${label}:${String(pages.doc.title)}`))
    await pages.update(hooks, { id: 1, data: { title: 'New' }, afterChange: announce('saved') })
    // The work saw the stored value.
    assert.deepEqual(seen, ['saved:New'])
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Bad' }, afterChange: announce('rolled back'), fail: true }))
    // The commit throws after every afterOperation hook ran: not stored, so no work either.
    adapter.failCommit = true
    await assert.rejects(pages.update(hooks, { id: 1, data: { title: 'Lost' }, afterChange: announce('commit failed') }), /commit failed/)
    assert.deepEqual(seen, ['saved:New'])
    assert.equal(pages.doc.title, 'New')
    assert.equal(gate.size(), 0)
  })

  it('without a transaction, runs after-commit work when the operation succeeded, never after it failed', async () => {
    const gate = createWriteGate()
    const pages = fakeCollection({ id: 1, title: 'Old' }, null)
    const hooks = gate.hooks('pages')
    const seen: string[] = []
    await pages.update(hooks, { id: 1, data: { title: 'New' }, afterChange: (req) => gate.afterCommit(req, writeKey('pages', 1), () => seen.push('saved')) })
    await assert.rejects(
      pages.update(hooks, { id: 1, data: { title: 'Bad' }, fail: true, rest: true, afterChange: (req) => gate.afterCommit(req, writeKey('pages', 1), () => seen.push('failed')) }),
    )
    assert.deepEqual(seen, ['saved'])
  })

  it('drops the after-commit work of a nested save when the outer save rolls back', async () => {
    const gate = createWriteGate()
    const adapter = fakeAdapter(gate)
    const a = fakeCollection({ id: 'a', flag: true }, adapter)
    const b = fakeCollection({ id: 'b', flag: true }, adapter)
    const hooks = gate.hooks('pages')
    const seen: string[] = []
    await assert.rejects(
      a.update(hooks, {
        id: 'a',
        data: { flag: false },
        fail: true,
        nested: (req) => b.update(hooks, { id: 'b', data: { flag: false }, req, afterChange: (r) => gate.afterCommit(r, writeKey('pages', 'b'), () => seen.push('b')) }),
      }),
    )
    assert.deepEqual(seen, [])
    assert.equal(gate.size(), 0)
  })

  it('holds the gate across a read and an update that share the request, and drops the work of a caught failed update', async () => {
    const gate = createWriteGate()
    const pages = fakeCollection({ id: 1, layout: 'A', title: 'Old' }, fakeAdapter(gate))
    const hooks = gate.hooks('pages')
    const req: Record<string, unknown> = {}
    const seen: string[] = []
    // The region endpoint reads, then saves with the same request. A drawer save comes in between.
    const endpoint = gate.run(writeKey('pages', 1), req, async () => {
      const fresh = structuredClone(pages.doc)
      await ticks(5)
      return pages.update(hooks, { id: 1, data: { title: `${String(fresh.title)}!` }, req, afterChange: (r) => gate.afterCommit(r, writeKey('pages', 1), () => seen.push('ok')) })
    })
    await tick()
    const drawer = pages.update(hooks, { id: 1, data: { layout: 'B' } })
    await Promise.all([endpoint, drawer])
    assert.deepEqual(pages.doc, { id: 1, layout: 'B', title: 'Old!' })
    assert.deepEqual(seen, ['ok'])
    // The endpoint catches a failed update and answers: the run's task resolves, its work never runs.
    await gate.run(writeKey('pages', 1), req, async () => {
      await pages
        .update(hooks, { id: 1, data: { title: 'Bad' }, req, fail: true, afterChange: (r) => gate.afterCommit(r, writeKey('pages', 1), () => seen.push('failed')) })
        .catch(() => null)
    })
    assert.deepEqual(seen, ['ok'])
  })

  it('refuses bulk updates before they read or write, and leaves other operations alone', async () => {
    const gate = createWriteGate()
    const hooks = gate.hooks('pages')
    const req = {}
    const refused = (args: Record<string, unknown>) =>
      assert.rejects(
        async () => {
          await hooks.beforeOperation({ args: { ...args, req }, operation: 'update', req } as never)
        },
        (error: { status?: number; message?: string }) => error.status === 409 && /Update each document by ID\./.test(error.message ?? ''),
      )
    // REST sends `where` without an id; the Local API runs the bulk update unless `id` is truthy.
    await refused({ where: { id: { in: [1, 2] } } })
    await refused({ id: undefined, where: { id: { equals: 1 } } })
    await refused({ id: 0, where: { id: { equals: 1 } } })
    await refused({ id: '', where: { id: { equals: 1 } } })
    await refused({ id: 1, where: { id: { equals: 1 } } })
    await refused({ id: { equals: 1 } })
    await refused({})
    const create = { data: {}, req }
    assert.equal(await hooks.beforeOperation({ args: create, operation: 'create', req } as never), create)
    assert.equal(gate.holds(req), false)
    assert.equal(gate.size(), 0)
  })
})

describe('afterCommit outside a gated update', () => {
  it("waits for the request's own transaction (a restore of a version, which the gate does not run)", () => {
    const gate = createWriteGate()
    const runs: string[] = []
    gate.afterCommit({ transactionID: 'tx-restore' }, writeKey('pages', 1), () => runs.push('committed'))
    assert.equal(runs.join(','), '', 'not before the commit')
    gate.transactionEnded('tx-restore', true)
    assert.equal(runs.join(','), 'committed')
    gate.afterCommit({ transactionID: 'tx-rolled-back' }, writeKey('pages', 1), () => runs.push('rolled back'))
    gate.transactionEnded('tx-rolled-back', false)
    assert.equal(runs.join(','), 'committed', 'never after a rollback')
    gate.afterCommit({}, writeKey('pages', 1), () => runs.push('no transaction'))
    assert.equal(runs.join(','), 'committed,no transaction', 'without a transaction: at once')
  })
})

/**
 * A FinalizationRegistry stand-in: the test says when requests count as collected
 * (`collectAll`), instead of waiting for the garbage collector.
 */
class CapturedRegistry<H> {
  static last: CapturedRegistry<unknown> | null = null
  readonly held = new Map<unknown, H>()
  constructor(readonly callback: (held: H) => void) {
    CapturedRegistry.last = this as CapturedRegistry<unknown>
  }
  register(_target: object, held: H, token?: object) {
    this.held.set(token ?? {}, held)
  }
  unregister(token: object) {
    return this.held.delete(token)
  }
  /** Every request registered so far is collected now. */
  collectAll() {
    // A copy: a callback may register new requests.
    const entries = Array.from(this.held.entries())
    for (const [token, held] of entries) {
      this.held.delete(token)
      this.callback(held)
    }
  }
}

/** A gate built with the captured registry. */
function gateWithCapturedRegistry() {
  const real = globalThis.FinalizationRegistry
  globalThis.FinalizationRegistry = CapturedRegistry as unknown as typeof FinalizationRegistry
  try {
    const gate = createWriteGate({ waitMs: 2000 })
    return { gate, registry: CapturedRegistry.last! }
  } finally {
    globalThis.FinalizationRegistry = real
  }
}

describe('collected requests', () => {
  it('never ends the hold of an open transaction when its request is collected: only the commit does', async () => {
    const { gate, registry } = gateWithCapturedRegistry()
    const hooks = gate.hooks('pages')
    // A save in transaction A (Payload's `req: { transactionID }`): it ends, the transaction stays open.
    const first = { transactionID: 'tx-a' }
    const args = { id: 1 }
    await hooks.beforeOperation({ args, operation: 'update', req: first } as never)
    await hooks.afterOperation({ args, operation: 'updateByID', req: first, result: {} } as never)
    // Another request object in the same transaction joins it.
    const joined = { transactionID: 'tx-a' }
    const joinedArgs = { id: 1 }
    await hooks.beforeOperation({ args: joinedArgs, operation: 'update', req: joined } as never)
    await hooks.afterOperation({ args: joinedArgs, operation: 'updateByID', req: joined, result: {} } as never)
    // A save of the same document in transaction B waits.
    let other = false
    const waiting = Promise.resolve(hooks.beforeOperation({ args: { id: 1 }, operation: 'update', req: { transactionID: 'tx-b' } } as never)).then(() => {
      other = true
    })
    await ticks(5)
    assert.equal(other, false)
    // Both request objects of transaction A are collected while it is still open.
    registry.collectAll()
    await ticks(5)
    assert.equal(other, false, 'transaction B still waits: transaction A is open')
    assert.equal(gate.holds(first), true)
    // Only the adapter's answer ends it.
    gate.transactionEnded('tx-a', true)
    await waiting
    assert.equal(other, true)
    gate.transactionEnded('tx-b', false)
    assert.equal(gate.size(), 0)
  })

  it('ends an orphaned save without a transaction once its request is collected', async () => {
    const { gate, registry } = gateWithCapturedRegistry()
    const hooks = gate.hooks('pages')
    // A Local API save that failed with no signal (no afterOperation, no transaction).
    await hooks.beforeOperation({ args: { id: 2 }, operation: 'update', req: {} } as never)
    let next = false
    const nextArgs = { id: 2 }
    const nextReq = {}
    const waiting = Promise.resolve(hooks.beforeOperation({ args: nextArgs, operation: 'update', req: nextReq } as never)).then(() => {
      next = true
    })
    await ticks(5)
    assert.equal(next, false)
    registry.collectAll()
    await waiting
    assert.equal(next, true, 'the orphan ended')
    await hooks.afterOperation({ args: nextArgs, operation: 'updateByID', req: nextReq, result: {} } as never)
    assert.equal(gate.size(), 0)
  })
})
