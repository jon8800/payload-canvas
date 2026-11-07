import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convertWhereValue, parseWhereValue, rowsWhere, whereRows, whereValueText } from './whereRows'

describe('whereRows', () => {
  it('reads a flat where and an and-list', () => {
    assert.deepEqual(whereRows(undefined), [])
    assert.deepEqual(whereRows(null), [])
    assert.deepEqual(whereRows({}), [])
    assert.deepEqual(whereRows({ featured: { equals: true }, price: { greater_than: 5, less_than: 9 } }), [
      { field: 'featured', operator: 'equals', value: true },
      { field: 'price', operator: 'greater_than', value: 5 },
      { field: 'price', operator: 'less_than', value: 9 },
    ])
    assert.deepEqual(whereRows({ and: [{ tags: { in: ['a', 'b'] } }, { photo: { exists: true } }] }), [
      { field: 'tags', operator: 'in', value: ['a', 'b'] },
      { field: 'photo', operator: 'exists', value: true },
    ])
  })

  it('returns null for a where the rows cannot show', () => {
    for (const where of [
      { or: [{ a: { equals: 1 } }] },
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
      assert.equal(whereRows(where), null, JSON.stringify(where))
    }
  })
})

describe('rowsWhere', () => {
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
  })

  it('round-trips what whereRows reads', () => {
    for (const where of [{ a: { equals: 'x' }, b: { in: [1, 2] } }, { and: [{ a: { like: 'x' } }, { a: { like: 'y' } }] }]) {
      assert.deepEqual(rowsWhere(whereRows(where)!), where)
    }
  })
})

describe('values', () => {
  it('parses typed text by operator and field type', () => {
    assert.equal(parseWhereValue('0412', 'equals'), '0412')
    assert.equal(parseWhereValue('$now-30d', 'greater_than', 'date'), '$now-30d')
    assert.equal(parseWhereValue('12', 'equals', 'number'), 12)
    assert.equal(parseWhereValue('abc', 'equals', 'number'), 'abc')
    assert.equal(parseWhereValue('true', 'equals', 'checkbox'), true)
    assert.equal(parseWhereValue('false', 'exists'), false)
    assert.equal(parseWhereValue('true', 'exists'), true)
    assert.deepEqual(parseWhereValue(' a, b ,,c', 'in'), ['a', 'b', 'c'])
    assert.deepEqual(parseWhereValue('1, 2', 'not_in', 'number'), [1, 2])
  })

  it('shows values as text and converts them on an operator change', () => {
    assert.equal(whereValueText(['a', 2]), 'a, 2')
    assert.equal(whereValueText(undefined), '')
    assert.equal(whereValueText(5), '5')
    assert.deepEqual(convertWhereValue({ field: 'a', operator: 'equals', value: 'x, y' }, 'in'), ['x', 'y'])
    assert.equal(convertWhereValue({ field: 'a', operator: 'in', value: ['x', 'y'] }, 'equals'), 'x, y')
    assert.equal(convertWhereValue({ field: 'a', operator: 'equals', value: 'x' }, 'exists'), true)
  })
})
