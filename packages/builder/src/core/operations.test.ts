import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyOperation, applyOperations } from './operations'
import { findBlock, findLocation, indexLayout, walkBlocks } from './tree'
import type { Block, Layout, Operation } from './types'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

function ok(result: ReturnType<typeof applyOperation>): Extract<typeof result, { ok: true }> {
  if (!result.ok) throw new Error(result.error)
  return result
}

/** Applies `op`, checks the inverse restores the input exactly, and returns the new layout. */
function roundTrip(layout: Layout, op: Operation): Layout {
  const result = ok(applyOperation(deepFreeze(layout), op))
  const undone = ok(applyOperations(deepFreeze(result.layout), result.inverse))
  assert.deepStrictEqual(undone.layout, layout)
  return result.layout
}

function ids(layout: Layout, parentId: string | null, slot = 'children'): string[] {
  const list = parentId === null ? layout.blocks : (findBlock(layout, parentId)?.slots?.[slot] ?? [])
  return list.map((b) => b.id)
}

function assertCanonical(layout: Layout): void {
  const seen = new Set<string>()
  walkBlocks(layout, (block) => {
    assert.ok(!seen.has(block.id), `duplicate id ${block.id}`)
    seen.add(block.id)
    if (block.slots) {
      assert.ok(Object.keys(block.slots).length > 0, 'empty slots object')
      for (const list of Object.values(block.slots)) assert.ok(list.length > 0, 'empty slot list')
    }
    if (block.props) assert.ok(Object.keys(block.props).length > 0, 'empty props')
    if (block.bindings) assert.ok(Object.keys(block.bindings).length > 0, 'empty bindings')
    assert.notEqual(block.hidden, false)
  })
}

// root: hero_heading, hero_text, section(stack) > [features_grid > [card_a > [a_title, a_text], card_b > [b_title]], card_c(empty)]
const sample: Layout = deepFreeze({
  version: 1,
  blocks: [
    { id: 'hero_heading', type: 'heading', props: { text: 'Hello', level: '1' }, className: 'text-5xl' },
    { id: 'hero_text', type: 'text', props: { text: 'Intro' } },
    {
      id: 'section',
      type: 'stack',
      slots: {
        children: [
          {
            id: 'features_grid',
            type: 'grid',
            slots: {
              children: [
                {
                  id: 'card_a',
                  type: 'stack',
                  slots: {
                    children: [
                      { id: 'a_title', type: 'heading', props: { text: 'Fast', level: '3' } },
                      { id: 'a_text', type: 'text', props: { text: 'Very' } },
                    ],
                  },
                },
                { id: 'card_b', type: 'stack', slots: { children: [{ id: 'b_title', type: 'heading', props: { text: 'Nested' } }] } },
              ],
            },
          },
          { id: 'card_c', type: 'stack' },
        ],
      },
    },
  ],
})

describe('operations', () => {
  it('inserts at the given final index and undoes', () => {
    const block = { id: 'new_1', type: 'text', props: { text: 'Hi' } }
    const next = roundTrip(sample, { type: 'insert', block, to: { parentId: 'card_a', index: 1 } })
    assert.deepEqual(ids(next, 'card_a'), ['a_title', 'new_1', 'a_text'])
  })

  it('inserts into an empty container, creating the slot, and undo removes the slot again', () => {
    const next = roundTrip(sample, { type: 'insert', block: { id: 'n', type: 'text' }, to: { parentId: 'card_c', index: 0 } })
    assert.deepEqual(ids(next, 'card_c'), ['n'])
  })

  it('stores inserted blocks in canonical form', () => {
    const block: Block = { id: 'n', type: 'stack', props: {}, slots: { children: [] }, bindings: {} }
    const next = ok(applyOperation(sample, { type: 'insert', block: { ...block, hidden: false } as Block, to: { parentId: null, index: 0 } }))
    assert.deepStrictEqual(next.layout.blocks[0], { id: 'n', type: 'stack' })
  })

  it('refuses bad inserts', () => {
    const at = { parentId: null, index: 0 }
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'hero_text', type: 'text' }, to: at }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'x', type: 'text' }, to: { parentId: 'nope', index: 0 } }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'x', type: 'text' }, to: { parentId: null, index: 4 } }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'x', type: 'text' }, to: { parentId: null, index: -1 } }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'x', type: 'text' }, to: { parentId: null, index: 0.5 } }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'x', type: 'text' }, to: { parentId: null, slot: 'aside', index: 0 } }).ok, false)
    const dupInside = { id: 'x', type: 'stack', slots: { children: [{ id: 'y', type: 'text' }, { id: 'y', type: 'text' }] } }
    assert.equal(applyOperation(sample, { type: 'insert', block: dupInside, to: at }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: '', type: 'text' }, to: at }).ok, false)
    assert.equal(applyOperation(sample, { type: 'insert', block: { id: 'x' } as Block, to: at }).ok, false)
  })

  it('removes a subtree and undo puts it back in place', () => {
    const next = roundTrip(sample, { type: 'remove', id: 'features_grid' })
    assert.deepEqual(ids(next, 'section'), ['card_c'])
    assert.equal(findBlock(next, 'a_title'), null)
  })

  it('removing the last child deletes the slot; undo restores it', () => {
    const next = roundTrip(sample, { type: 'remove', id: 'b_title' })
    assert.equal(findBlock(next, 'card_b')?.slots, undefined)
  })

  it('moves forward within the same list (final index semantics)', () => {
    const next = roundTrip(sample, { type: 'move', id: 'hero_heading', to: { parentId: null, index: 1 } })
    assert.deepEqual(ids(next, null), ['hero_text', 'hero_heading', 'section'])
    const last = roundTrip(sample, { type: 'move', id: 'hero_heading', to: { parentId: null, index: 2 } })
    assert.deepEqual(ids(last, null), ['hero_text', 'section', 'hero_heading'])
  })

  it('moves backward within the same list', () => {
    const next = roundTrip(sample, { type: 'move', id: 'section', to: { parentId: null, index: 0 } })
    assert.deepEqual(ids(next, null), ['section', 'hero_heading', 'hero_text'])
  })

  it('moving to the same index is a no-op', () => {
    const next = roundTrip(sample, { type: 'move', id: 'hero_text', to: { parentId: null, index: 1 } })
    assert.deepStrictEqual(next, sample)
  })

  it('refuses an index past the end of the list after removal', () => {
    assert.equal(applyOperation(sample, { type: 'move', id: 'hero_heading', to: { parentId: null, index: 3 } }).ok, false)
  })

  it('moves a block into another parent, keeping props and children', () => {
    const next = roundTrip(sample, { type: 'move', id: 'card_a', to: { parentId: 'card_c', index: 0 } })
    assert.deepEqual(ids(next, 'card_c'), ['card_a'])
    assert.deepEqual(ids(next, 'card_a'), ['a_title', 'a_text'])
    assert.deepEqual(findLocation(next, 'a_title'), { parentId: 'card_a', slot: 'children', index: 0, depth: 3 })
  })

  it('moves the only child out (slot deleted) and back (slot restored)', () => {
    const next = roundTrip(sample, { type: 'move', id: 'b_title', to: { parentId: null, index: 0 } })
    assert.equal(findBlock(next, 'card_b')?.slots, undefined)
  })

  it('refuses to move a block into itself or its descendants', () => {
    assert.equal(applyOperation(sample, { type: 'move', id: 'section', to: { parentId: 'section', index: 0 } }).ok, false)
    assert.equal(applyOperation(sample, { type: 'move', id: 'section', to: { parentId: 'card_a', index: 0 } }).ok, false)
    assert.equal(applyOperation(sample, { type: 'move', id: 'nope', to: { parentId: null, index: 0 } }).ok, false)
  })

  it('duplicates a subtree right after the original with fresh descendant ids', () => {
    const next = roundTrip(sample, { type: 'duplicate', id: 'card_a', newId: 'card_a2' })
    assert.deepEqual(ids(next, 'features_grid'), ['card_a', 'card_a2', 'card_b'])
    const copy = findBlock(next, 'card_a2')
    assert.equal(copy?.slots?.children.length, 2)
    assert.equal(copy?.slots?.children[0].props?.text, 'Fast')
    const all = [...indexLayout(next).keys()]
    assert.equal(new Set(all).size, all.length)
    assert.equal(applyOperation(sample, { type: 'duplicate', id: 'card_a', newId: 'card_b' }).ok, false)
    assert.equal(applyOperation(sample, { type: 'duplicate', id: 'nope', newId: 'x' }).ok, false)
  })

  it('updates props (shallow merge), unsets props and undoes exactly', () => {
    const next = roundTrip(sample, { type: 'update', id: 'a_title', props: { text: 'Quick', extra: 1 }, unsetProps: ['level'] })
    assert.deepStrictEqual(findBlock(next, 'a_title')?.props, { text: 'Quick', extra: 1 })
  })

  it('removes `props` when the last prop is unset', () => {
    const next = roundTrip(sample, { type: 'update', id: 'hero_text', unsetProps: ['text'] })
    assert.equal('props' in (findBlock(next, 'hero_text') ?? {}), false)
  })

  it('adds props to a block without props and undo removes them', () => {
    roundTrip(sample, { type: 'update', id: 'card_c', props: { x: 1 } })
  })

  it('sets and removes className and hidden', () => {
    const a = roundTrip(sample, { type: 'update', id: 'hero_heading', className: null, hidden: true })
    assert.equal(findBlock(a, 'hero_heading')?.className, undefined)
    assert.equal(findBlock(a, 'hero_heading')?.hidden, true)
    const b = roundTrip(a, { type: 'update', id: 'hero_heading', className: 'p-4', hidden: false })
    assert.equal(findBlock(b, 'hero_heading')?.className, 'p-4')
    assert.equal('hidden' in (findBlock(b, 'hero_heading') ?? {}), false)
  })

  it('merges bindings and removes them with null', () => {
    const a = roundTrip(sample, { type: 'update', id: 'hero_heading', bindings: { text: 'title', level: 'x' } })
    assert.deepEqual(findBlock(a, 'hero_heading')?.bindings, { text: 'title', level: 'x' })
    const b = roundTrip(a, { type: 'update', id: 'hero_heading', bindings: { level: null, other: 'y' } })
    assert.deepEqual(findBlock(b, 'hero_heading')?.bindings, { text: 'title', other: 'y' })
    const c = roundTrip(b, { type: 'update', id: 'hero_heading', bindings: { text: null, other: null } })
    assert.equal(findBlock(c, 'hero_heading')?.bindings, undefined)
  })

  it('does not let a "__proto__" prop change the prototype', () => {
    const props = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>
    const next = roundTrip(sample, { type: 'update', id: 'hero_text', props })
    const stored = findBlock(next, 'hero_text')?.props ?? {}
    assert.equal(Object.getPrototypeOf(stored), Object.prototype)
    assert.ok(Object.hasOwn(stored, '__proto__'))
  })

  it('rejects unknown and malformed operations without throwing', () => {
    assert.equal(applyOperation(sample, { type: 'explode' } as unknown as Operation).ok, false)
    assert.equal(applyOperation(sample, null as unknown as Operation).ok, false)
    assert.equal(applyOperation(sample, { type: 'update', id: 'hero_text', className: 5 } as unknown as Operation).ok, false)
    assert.equal(applyOperation(sample, { type: 'move', id: 'hero_text' } as unknown as Operation).ok, false)
  })

  it('applyOperations is all-or-nothing and returns a combined inverse', () => {
    const ops: Operation[] = [
      { type: 'insert', block: { id: 'n1', type: 'text' }, to: { parentId: null, index: 0 } },
      { type: 'move', id: 'n1', to: { parentId: 'card_c', index: 0 } },
      { type: 'update', id: 'n1', props: { text: 'x' } },
      { type: 'duplicate', id: 'section', newId: 'section2' },
      { type: 'remove', id: 'hero_heading' },
    ]
    const result = ok(applyOperations(sample, ops))
    assert.deepStrictEqual(ok(applyOperations(result.layout, result.inverse)).layout, sample)
    const failed = applyOperations(sample, [...ops, { type: 'remove', id: 'nope' }])
    assert.equal(failed.ok, false)
    assert.match(failed.ok ? '' : failed.error, /Operation 5/)
  })
})

// ---------------------------------------------------------------------------
// Property test: random trees, random operation sequences, exact undo after every step
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRandom(seed: number) {
  const rand = mulberry32(seed)
  let counter = 0
  const int = (n: number) => Math.floor(rand() * n)
  const pick = <T>(list: T[]): T => list[int(list.length)]
  const chance = (p: number) => rand() < p
  const nextId = () => `r${seed}_${counter++}`
  // Odd seeds never duplicate, so their whole history can be replayed as one batch.
  const allowDuplicate = seed % 2 === 0

  const randomBlock = (depth: number): Block => {
    const container = depth < 3 && chance(0.4)
    const block: Block = { id: nextId(), type: container ? 'stack' : pick(['text', 'heading']) }
    if (chance(0.7)) block.props = { text: `t${int(100)}`, ...(chance(0.3) ? { level: String(1 + int(6)) } : {}) }
    if (chance(0.5)) block.className = pick(['p-4', 'flex gap-2', 'md:p-8 text-lg'])
    if (chance(0.2)) block.bindings = { text: 'title' }
    if (chance(0.1)) block.hidden = true
    if (container) {
      const slots: Record<string, Block[]> = {}
      for (const name of ['children', 'aside']) {
        const count = int(name === 'children' ? 4 : 2)
        if (count > 0) slots[name] = Array.from({ length: count }, () => randomBlock(depth + 1))
      }
      if (Object.keys(slots).length > 0) block.slots = slots
    }
    return block
  }

  const randomLayout = (): Layout => ({ version: 1, blocks: Array.from({ length: 1 + int(4) }, () => randomBlock(0)) })

  const randomOp = (layout: Layout): Operation => {
    const all = [...indexLayout(layout).values()]
    const someId = () => (all.length > 0 && chance(0.95) ? pick(all).block.id : 'missing')
    const randomPosition = () => {
      const parent = all.length > 0 && chance(0.7) ? pick(all).block : null
      const slot = parent ? pick(['children', 'aside']) : 'children'
      const length = parent ? (parent.slots?.[slot]?.length ?? 0) : layout.blocks.length
      return { parentId: parent?.id ?? null, slot, index: int(length + 2) }
    }
    switch (int(5)) {
      case 0:
        return { type: 'insert', block: randomBlock(1), to: randomPosition() }
      case 1:
        return { type: 'move', id: someId(), to: randomPosition() }
      case 2:
        return { type: 'remove', id: someId() }
      case 3:
        if (!allowDuplicate) return { type: 'remove', id: someId() }
        return { type: 'duplicate', id: someId(), newId: chance(0.95) ? nextId() : someId() }
      default: {
        const op: Extract<Operation, { type: 'update' }> = { type: 'update', id: someId() }
        if (chance(0.6)) op.props = { [pick(['text', 'level', 'extra'])]: `v${int(10)}` }
        if (chance(0.3)) op.unsetProps = [pick(['text', 'level', 'extra'])]
        if (chance(0.3)) op.className = chance(0.3) ? null : pick(['', 'p-2', 'grid'])
        if (chance(0.3)) op.hidden = chance(0.5)
        if (chance(0.3)) op.bindings = { [pick(['text', 'level'])]: chance(0.4) ? null : 'title' }
        return op
      }
    }
  }

  return { randomLayout, randomOp }
}

describe('operations: random sequences', () => {
  it('every successful operation is undone exactly by its inverse', () => {
    let successes = 0
    let failures = 0
    for (let seed = 1; seed <= 150; seed++) {
      const { randomLayout, randomOp } = makeRandom(seed)
      const start = deepFreeze(randomLayout())
      assertCanonical(start)
      let layout = start
      const applied: Operation[] = []
      let combinedInverse: Operation[] = []
      for (let step = 0; step < 40; step++) {
        const op = randomOp(layout)
        const result = applyOperation(layout, op)
        if (!result.ok) {
          failures++
          continue
        }
        successes++
        deepFreeze(result.layout)
        assertCanonical(result.layout)
        const undone = applyOperations(result.layout, result.inverse)
        assert.ok(undone.ok, `seed ${seed} step ${step}: inverse failed`)
        assert.deepStrictEqual(undone.layout, layout, `seed ${seed} step ${step}: ${JSON.stringify(op)}`)
        applied.push(op)
        combinedInverse = [...result.inverse, ...combinedInverse]
        layout = result.layout
      }
      // Undoing the whole history in reverse order restores the start.
      const undoAll = applyOperations(layout, combinedInverse)
      assert.ok(undoAll.ok)
      assert.deepStrictEqual(undoAll.layout, start)
      // Replaying as one batch gives the same layout. Skipped when a duplicate ran: its child ids
      // are random, so later ops that target them cannot be replayed.
      if (!applied.some((op) => op.type === 'duplicate')) {
        const batch = applyOperations(start, applied)
        assert.ok(batch.ok)
        assert.deepStrictEqual(batch.layout, layout)
        assert.deepStrictEqual(ok(applyOperations(batch.layout, batch.inverse)).layout, start)
      }
    }
    assert.ok(successes > 2000, `only ${successes} successful ops`)
    assert.ok(failures > 100, `only ${failures} failed ops`)
  })
})
