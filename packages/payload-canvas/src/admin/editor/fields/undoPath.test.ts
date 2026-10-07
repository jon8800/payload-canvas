import assert from 'node:assert/strict'
import { test } from 'node:test'

import { changedPath, fieldMergeKey } from './undoPath'

test('changedPath finds the one changed leaf in array rows', () => {
  const before = [
    { id: 'a', label: 'One', url: '/1' },
    { id: 'b', label: 'Two', url: '/2' },
  ]
  const after = [before[0], { ...before[1], label: 'Two!' }]
  assert.deepEqual(changedPath(before, after), ['1', 'label'])
  // Fresh copies of unchanged rows still compare equal.
  assert.deepEqual(changedPath(before, structuredClone(after)), ['1', 'label'])
})

test('changedPath stops where several children or the shape changed', () => {
  assert.deepEqual(changedPath({ a: 1, b: 2 }, { a: 2, b: 3 }), [])
  assert.deepEqual(changedPath([1, 2], [1, 2, 3]), [])
  assert.deepEqual(changedPath('x', 'y'), [])
  assert.deepEqual(changedPath({ a: { b: 1 } }, { a: { b: 2 } }), ['a', 'b'])
  assert.deepEqual(changedPath({ a: 1 }, { a: 1, b: 2 }), ['b'])
  // A new group: the same path as later edits inside it.
  assert.deepEqual(changedPath([{ id: 'r' }], [{ id: 'r', link: { url: '/' } }]), ['0', 'link', 'url'])
})

test('fieldMergeKey: one key per field, different fields differ', () => {
  const rows = [{ label: '', url: '' }]
  const k1 = fieldMergeKey('blk', 'links', rows, [{ label: 'A', url: '' }])
  const k2 = fieldMergeKey('blk', 'links', rows, [{ label: '', url: '/a' }])
  assert.equal(k1, 'props:blk:links.0.label')
  assert.equal(k2, 'props:blk:links.0.url')
  assert.equal(fieldMergeKey('blk', 'text', 'a', 'ab'), 'props:blk:text')
})
