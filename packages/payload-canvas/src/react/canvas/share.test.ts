import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shareStructure } from './share'

const layout = () => ({
  version: 1,
  blocks: [
    { id: 'a', type: 'heading', props: { text: 'A' } },
    { id: 'b', type: 'stack', slots: { children: [{ id: 'c', type: 'text', props: { text: 'C' } }, { id: 'd', type: 'text' }] } },
  ],
})

test('a deep-equal copy gives back the previous object', () => {
  const prev = layout()
  assert.equal(shareStructure(prev, layout()), prev)
})

test('only the changed block and its ancestors are new objects', () => {
  const prev = layout()
  const next = layout()
  next.blocks[1].slots!.children[0].props!.text = 'C!'
  const shared = shareStructure(prev, next)
  assert.notEqual(shared, prev)
  assert.equal(shared.blocks[0], prev.blocks[0])
  assert.notEqual(shared.blocks[1], prev.blocks[1])
  assert.notEqual(shared.blocks[1].slots!.children[0], prev.blocks[1].slots!.children[0])
  assert.equal(shared.blocks[1].slots!.children[1], prev.blocks[1].slots!.children[1])
  assert.deepEqual(shared, next)
})

test('added and removed keys and items are changes', () => {
  const prev = layout()
  const added = layout() as ReturnType<typeof layout> & { extra?: number }
  added.extra = 1
  assert.notEqual(shareStructure(prev, added), prev)
  assert.deepEqual(shareStructure(prev, added), added)

  const removed = layout()
  removed.blocks.pop()
  const shared = shareStructure(prev, removed)
  assert.equal(shared.blocks.length, 1)
  assert.equal(shared.blocks[0], prev.blocks[0])

  const prevWithB = { a: 1, b: 2 }
  const without = shareStructure(prevWithB, { a: 1 })
  assert.notEqual(without, prevWithB)
  assert.deepEqual(without, { a: 1 })
})

test('a key set to undefined differs from a missing key', () => {
  const prev: Record<string, unknown> = { a: 1 }
  const next: Record<string, unknown> = { b: undefined, a: 1 }
  const shared = shareStructure(prev, next)
  assert.notEqual(shared, prev)
  assert.ok('b' in shared)
})

test('non-plain values compare by identity', () => {
  const date = new Date(0)
  const prev = { when: date }
  assert.notEqual(shareStructure(prev, { when: new Date(0) }), prev)
  assert.equal(shareStructure(prev, { when: date }), prev)
  assert.equal(shareStructure(null, 3), 3)
  assert.equal(shareStructure([1, 2], [1, 2]).length, 2)
})
