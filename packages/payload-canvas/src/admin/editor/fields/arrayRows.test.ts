import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { arrayStateKey, cloneRow, fallbackRowLabel, moveItem, toggleId, withRowIds, type ArrayRow } from './arrayRows'

const counter = () => {
  let n = 0
  return () => `new${++n}`
}

describe('withRowIds', () => {
  it('keeps rows with ids as the same objects and drops non-objects', () => {
    const a = { id: 'a', text: 'A' }
    const rows = withRowIds([a, 'x', null, [1]], () => 'unused')
    assert.equal(rows.length, 1)
    assert.equal(rows[0], a)
  })

  it('gives rows without an id, or with a repeated id, a free id', () => {
    const next = counter()
    const rows = withRowIds([{ id: 'a' }, { text: 'no id' }, { id: 'a' }, { id: '' }], () => next())
    assert.deepEqual(
      rows.map((row) => row.id),
      ['a', 'new1', 'new2', 'new3'],
    )
    assert.equal(rows[1]?.text, 'no id')
  })

  it('passes the taken ids, so a generated id never repeats a stored one', () => {
    const rows = withRowIds([{ id: 'g0' }, {}], (index, taken) => (taken.has(`g${index - 1}`) ? 'fresh' : `g${index - 1}`))
    assert.deepEqual(
      rows.map((row) => row.id),
      ['g0', 'fresh'],
    )
  })

  it('returns no rows for a missing value', () => {
    assert.deepEqual(withRowIds(undefined, () => 'x'), [])
    assert.deepEqual(withRowIds({ id: 'a' }, () => 'x'), [])
  })
})

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd']

  it('moves to the final index', () => {
    assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd'])
    assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c'])
    assert.deepEqual(list, ['a', 'b', 'c', 'd'])
  })

  it('returns the same list when nothing moves', () => {
    assert.equal(moveItem(list, 1, 1), list)
    assert.equal(moveItem(list, -1, 2), list)
    assert.equal(moveItem(list, 0, 4), list)
  })
})

describe('toggleId', () => {
  it('adds and removes, and keeps the set when nothing changes', () => {
    const set: ReadonlySet<string> = new Set(['a'])
    assert.deepEqual([...toggleId(set, 'b', true)], ['a', 'b'])
    assert.deepEqual([...toggleId(set, 'a', false)], [])
    assert.equal(toggleId(set, 'a', true), set)
    assert.equal(toggleId(set, 'b', false), set)
  })
})

describe('arrayStateKey', () => {
  it('uses the path for a top-level array', () => {
    assert.equal(arrayStateKey('builder.b_1.items', null), 'builder.b_1.items')
  })

  it('uses the parent row key instead of its index for a nested array', () => {
    const parent = { rowPath: 'builder.b_1.items.2', rowKey: 'builder.b_1.items.r_9' }
    assert.equal(arrayStateKey('builder.b_1.items.2.links', parent), 'builder.b_1.items.r_9.links')
    assert.equal(arrayStateKey('builder.b_1.items.2.group.links', parent), 'builder.b_1.items.r_9.group.links')
    // Not inside that row (a prefix that only looks the same).
    assert.equal(arrayStateKey('builder.b_1.items.20.links', parent), 'builder.b_1.items.20.links')
  })
})

describe('cloneRow', () => {
  const fields = [
    { name: 'title', type: 'text' },
    { name: 'links', type: 'array', fields: [{ name: 'label', type: 'text' }] },
    { name: 'meta', type: 'group', fields: [{ name: 'tags', type: 'array', fields: [] }] },
    { type: 'row', fields: [{ name: 'more', type: 'array', fields: [] }] },
    { type: 'tabs', tabs: [{ name: 'tab', fields: [{ name: 'deep', type: 'array', fields: [] }] }] },
    { name: 'data', type: 'json' },
  ]

  it('copies deeply with new ids for the row and its nested array rows', () => {
    const row: ArrayRow = {
      id: 'r1',
      title: 'T',
      links: [{ id: 'l1', label: 'L' }],
      meta: { tags: [{ id: 't1' }] },
      more: [{ id: 'm1' }],
      tab: { deep: [{ id: 'd1' }] },
      data: [{ id: 'json-stays' }],
    }
    let n = 0
    const copy = cloneRow(row, fields, () => `n${++n}`)
    assert.equal(copy.id.startsWith('n'), true)
    assert.notEqual(copy.links, row.links)
    const ids = [
      copy.id,
      (copy.links as ArrayRow[])[0]?.id,
      ((copy.meta as { tags: ArrayRow[] }).tags)[0]?.id,
      (copy.more as ArrayRow[])[0]?.id,
      ((copy.tab as { deep: ArrayRow[] }).deep)[0]?.id,
    ]
    assert.equal(new Set(ids).size, 5)
    assert.ok(ids.every((id) => id?.startsWith('n')))
    assert.deepEqual(copy.data, [{ id: 'json-stays' }])
    assert.equal((copy.links as ArrayRow[])[0]?.label, 'L')
    assert.equal((row.links as ArrayRow[])[0]?.id, 'l1')
  })
})

describe('fallbackRowLabel', () => {
  it('pads the row number like Payload', () => {
    assert.equal(fallbackRowLabel('Item', 0), 'Item 01')
    assert.equal(fallbackRowLabel('Link', 11), 'Link 12')
  })
})
