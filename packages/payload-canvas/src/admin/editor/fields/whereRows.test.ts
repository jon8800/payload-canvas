import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { groupsWhere, parseWhereValue, rowsWhere, whereGroups, whereValueText } from './whereRows'

describe('whereGroups', () => {
  it('reads a flat where and an and-list as one group', () => {
    assert.deepEqual(whereGroups(undefined), [])
    assert.deepEqual(whereGroups(null), [])
    assert.deepEqual(whereGroups({}), [])
    assert.deepEqual(whereGroups({ featured: { equals: true }, price: { greater_than: 5, less_than: 9 } }), [
      [
        { field: 'featured', operator: 'equals', value: true },
        { field: 'price', operator: 'greater_than', value: 5 },
        { field: 'price', operator: 'less_than', value: 9 },
      ],
    ])
    assert.deepEqual(whereGroups({ and: [{ tags: { in: ['a', 'b'] } }, { photo: { exists: true } }, { summary: { exists: false } }] }), [
      [
        { field: 'tags', operator: 'in', value: ['a', 'b'] },
        { field: 'photo', operator: 'is_set', value: undefined },
        { field: 'summary', operator: 'is_empty', value: undefined },
      ],
    ])
  })

  it('reads "or" groups of flat wheres and and-lists', () => {
    assert.deepEqual(
      whereGroups({ or: [{ featured: { equals: true } }, { and: [{ price: { less_than: 10 } }, { stock: { greater_than: 0 } }] }] }),
      [
        [{ field: 'featured', operator: 'equals', value: true }],
        [
          { field: 'price', operator: 'less_than', value: 10 },
          { field: 'stock', operator: 'greater_than', value: 0 },
        ],
      ],
    )
  })

  it('reads values read at query time: dates, page fields and URL values (lists too)', () => {
    assert.deepEqual(whereGroups({ publishedAt: { greater_than: '$now-30d' }, category: { in: '$page.categories' }, tag: { not_in: '$query.tag' } }), [
      [
        { field: 'publishedAt', operator: 'greater_than', value: '$now-30d' },
        { field: 'category', operator: 'in', value: '$page.categories' },
        { field: 'tag', operator: 'not_in', value: '$query.tag' },
      ],
    ])
  })

  it('returns null for a where the rows cannot show, so it opens as JSON', () => {
    for (const where of [
      { or: [] },
      { or: [{}] },
      { or: [{ or: [{ a: { equals: 1 } }] }] },
      { or: [{ a: { equals: 1 } }], b: { equals: 2 } },
      { and: [{ or: [] }] },
      { a: { near: '1,2' } },
      { a: { equals: { x: 1 } } },
      { a: { equals: null } },
      { a: { in: 'x' } },
      { a: { exists: 'yes' } },
      { a: {} },
      { a: 1 },
      [],
      'a',
      { and: 'x' },
    ]) {
      assert.equal(whereGroups(where), null, JSON.stringify(where))
    }
  })
})

describe('rowsWhere and groupsWhere', () => {
  it('writes one object, merging operators of one field', () => {
    assert.equal(rowsWhere([]), undefined)
    assert.equal(rowsWhere([{ field: ' ', operator: 'equals', value: 'x' }]), undefined)
    assert.deepEqual(
      rowsWhere([
        { field: 'price', operator: 'greater_than', value: 5 },
        { field: 'price', operator: 'less_than', value: 9 },
        { field: '', operator: 'equals', value: 'left out' },
      ]),
      { price: { greater_than: 5, less_than: 9 } },
    )
  })

  it('uses an and-list when a field has the same operator twice', () => {
    assert.deepEqual(
      rowsWhere([
        { field: 'name', operator: 'not_equals', value: 'a' },
        { field: 'name', operator: 'not_equals', value: 'b' },
      ]),
      { and: [{ name: { not_equals: 'a' } }, { name: { not_equals: 'b' } }] },
    )
    assert.deepEqual(
      rowsWhere([
        { field: 'photo', operator: 'is_set', value: undefined },
        { field: 'photo', operator: 'is_empty', value: undefined },
      ]),
      { and: [{ photo: { exists: true } }, { photo: { exists: false } }] },
    )
  })

  it('writes is_set and is_empty as exists', () => {
    assert.deepEqual(rowsWhere([{ field: 'photo', operator: 'is_set', value: undefined }]), { photo: { exists: true } })
    assert.deepEqual(rowsWhere([{ field: 'photo', operator: 'is_empty', value: 'ignored' }]), { photo: { exists: false } })
  })

  it('writes one group as is and several as "or"; empty groups are left out', () => {
    assert.equal(groupsWhere([]), undefined)
    assert.equal(groupsWhere([[{ field: '', operator: 'equals', value: '' }]]), undefined)
    assert.deepEqual(groupsWhere([[{ field: 'a', operator: 'equals', value: 1 }], [{ field: '', operator: 'equals', value: '' }]]), { a: { equals: 1 } })
    assert.deepEqual(
      groupsWhere([
        [{ field: 'featured', operator: 'equals', value: true }],
        [
          { field: 'price', operator: 'less_than', value: 10 },
          { field: 'stock', operator: 'greater_than', value: 0 },
        ],
      ]),
      { or: [{ featured: { equals: true } }, { price: { less_than: 10 }, stock: { greater_than: 0 } }] },
    )
  })

  it('round-trips what whereGroups reads, with the same meaning', () => {
    for (const where of [
      { a: { equals: 'x' }, b: { in: [1, 2] } },
      { and: [{ a: { like: 'x' } }, { a: { like: 'y' } }] },
      { or: [{ a: { equals: 'x' } }, { b: { exists: false }, c: { greater_than: '$now-7d' } }] },
      { or: [{ category: { equals: '$page.category' } }, { tag: { in: '$query.tag' } }] },
    ]) {
      assert.deepEqual(groupsWhere(whereGroups(where)!), where, JSON.stringify(where))
    }
    // An and-list without repeats reads back as one object: the same query.
    assert.deepEqual(groupsWhere(whereGroups({ and: [{ a: { equals: 1 } }, { b: { equals: 2 } }] })!), { a: { equals: 1 }, b: { equals: 2 } })
  })
})

describe('values', () => {
  it('parses typed text by operator and field type', () => {
    assert.equal(parseWhereValue('0412', 'equals'), '0412')
    assert.equal(parseWhereValue('$now-30d', 'greater_than', 'date'), '$now-30d')
    assert.equal(parseWhereValue('12', 'equals', 'number'), 12)
    assert.equal(parseWhereValue('abc', 'equals', 'number'), 'abc')
    assert.equal(parseWhereValue('true', 'equals', 'checkbox'), true)
    assert.equal(parseWhereValue('x', 'is_set'), undefined)
    assert.deepEqual(parseWhereValue(' a, b ,,c', 'in'), ['a', 'b', 'c'])
    assert.deepEqual(parseWhereValue('1, 2', 'not_in', 'number'), [1, 2])
  })

  it('shows values as text', () => {
    assert.equal(whereValueText(['a', 2]), 'a, 2')
    assert.equal(whereValueText(undefined), '')
    assert.equal(whereValueText(5), '5')
  })
})
