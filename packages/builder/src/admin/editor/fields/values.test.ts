import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fromRelationshipInput,
  isFieldVisible,
  parseJsonText,
  rowLabel,
  setKey,
  toJsonText,
  toRelationshipInput,
} from './values'

describe('isFieldVisible', () => {
  const type = { name: 'type', type: 'select', defaultValue: 'url' }
  const url = { name: 'url', type: 'text', admin: { custom: { builderCondition: { field: 'type', equals: 'url' } } } }
  const ref = {
    name: 'reference',
    type: 'relationship',
    admin: { custom: { builderCondition: { field: 'type', equals: 'reference' } } },
  }
  const siblings = [type, url, ref]

  it('matches the sibling value, or its default when missing', () => {
    assert.equal(isFieldVisible(url, {}, siblings), true)
    assert.equal(isFieldVisible(ref, {}, siblings), false)
    assert.equal(isFieldVisible(ref, { type: 'reference' }, siblings), true)
    assert.equal(isFieldVisible(url, { type: 'reference' }, siblings), false)
  })

  it('accepts a list of values and hides hidden, disabled and virtual fields', () => {
    const both = {
      name: 'x',
      type: 'text',
      admin: { custom: { builderCondition: { field: 'type', equals: ['url', 'reference'] } } },
    }
    assert.equal(isFieldVisible(both, { type: 'reference' }, siblings), true)
    assert.equal(isFieldVisible({ name: 'a', type: 'text', admin: { hidden: true } }, {}, []), false)
    assert.equal(isFieldVisible({ name: 'a', type: 'text', admin: { disabled: true } }, {}, []), false)
    assert.equal(isFieldVisible({ name: 'a', type: 'text', virtual: true }, {}, []), false)
    assert.equal(isFieldVisible({ name: 'a', type: 'text' }, {}, []), true)
  })
})

describe('setKey', () => {
  it('sets, removes empty values and returns undefined for an empty object', () => {
    assert.deepEqual(setKey({ a: 1 }, 'b', 2), { a: 1, b: 2 })
    assert.deepEqual(setKey({ a: 1, b: 2 }, 'b', ''), { a: 1 })
    assert.equal(setKey({ a: 1 }, 'a', null), undefined)
    assert.deepEqual(setKey(undefined, 'a', [1]), { a: [1] })
    assert.equal(setKey(undefined, 'a', []), undefined)
    assert.deepEqual(setKey({ a: 1 }, 'b', false), { a: 1, b: false })
  })
})

describe('relationship values', () => {
  it('single collection: stores IDs', () => {
    assert.deepEqual(toRelationshipInput(5, ['pages'], false, false), { relationTo: 'pages', value: 5 })
    assert.deepEqual(toRelationshipInput({ id: 5 }, ['pages'], false, false), { relationTo: 'pages', value: 5 })
    assert.equal(toRelationshipInput(null, ['pages'], false, false), null)
    assert.equal(fromRelationshipInput({ relationTo: 'pages', value: 5 }, false), 5)
    assert.deepEqual(toRelationshipInput([1, 2], ['pages'], false, true), [
      { relationTo: 'pages', value: 1 },
      { relationTo: 'pages', value: 2 },
    ])
    assert.deepEqual(fromRelationshipInput([{ relationTo: 'pages', value: 1 }], false), [1])
    assert.equal(fromRelationshipInput(null, false), null)
  })

  it('polymorphic: stores { relationTo, value } with the ID only', () => {
    const pair = { relationTo: 'posts', value: 3 }
    assert.deepEqual(toRelationshipInput(pair, ['pages', 'posts'], true, false), pair)
    assert.deepEqual(
      toRelationshipInput({ relationTo: 'posts', value: { id: 3, title: 'x' } }, ['pages', 'posts'], true, false),
      pair,
    )
    assert.equal(toRelationshipInput(3, ['pages', 'posts'], true, false), null)
    assert.deepEqual(fromRelationshipInput({ relationTo: 'posts', value: 3 }, true), pair)
    assert.deepEqual(fromRelationshipInput([pair, { relationTo: 'pages', value: null }], true), [pair])
  })
})

describe('rowLabel', () => {
  it('uses the first text-like value', () => {
    const fields = [
      { name: 'image', type: 'upload' },
      { name: 'title', type: 'text' },
      { name: 'body', type: 'textarea' },
    ]
    assert.equal(rowLabel({ image: 1, title: ' Hello ' }, fields), 'Hello')
    assert.equal(rowLabel({ image: 1, title: '', body: 'Body' }, fields), 'Body')
    assert.equal(rowLabel({ image: 1 }, fields), null)
  })
})

describe('json text', () => {
  it('round-trips and reports parse errors', () => {
    assert.equal(toJsonText(undefined), '')
    assert.equal(toJsonText({ a: 1 }), '{\n  "a": 1\n}')
    assert.deepEqual(parseJsonText('{"a":1}'), { ok: true, value: { a: 1 } })
    assert.deepEqual(parseJsonText('  '), { ok: true, value: undefined })
    assert.equal(parseJsonText('{a').ok, false)
  })
})
