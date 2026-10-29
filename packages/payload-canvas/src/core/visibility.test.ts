import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isVisible, visibilityFieldPaths } from './bindings'
import type { TemplateContext } from './types'
import { checkVisibility, groupsVisibility, normalizeVisibility, visibilityConditions, visibilityGroups, type BlockVisibility } from './visibility'

const a = { field: 'a', operator: 'is_set' as const }
const b = { field: 'b', operator: 'is_set' as const }
const c = { field: 'c', operator: 'is_set' as const }

describe('visibility groups', () => {
  it('checks group entries and keeps the canonical form', () => {
    assert.deepEqual(checkVisibility({ match: 'any', conditions: [{ all: [a, b] }, c] }), { match: 'any', conditions: [{ all: [a, b] }, c] })
    // Without "any", groups are flattened; a group of one is its condition.
    assert.deepEqual(checkVisibility({ conditions: [{ all: [a, b] }, c] }), { conditions: [a, b, c] })
    assert.deepEqual(checkVisibility({ match: 'any', conditions: [{ all: [a] }, c] }), { match: 'any', conditions: [a, c] })
    assert.deepEqual(checkVisibility({ match: 'any', conditions: [{ all: [a, b] }] }), { match: 'any', conditions: [{ all: [a, b] }] })
    assert.deepEqual(checkVisibility({ match: 'all', conditions: [a] }), { conditions: [a] })
  })

  it('rejects bad groups when checking, and drops them when normalizing', () => {
    assert.match(String(checkVisibility({ match: 'any', conditions: [{ all: [] }, a] })), /must hold a condition/)
    assert.match(String(checkVisibility({ match: 'any', conditions: [{ all: [a], extra: 1 }] })), /only the key "all"/)
    assert.match(String(checkVisibility({ match: 'any', conditions: [{ all: 'x' }] })), /list of conditions/)
    assert.match(String(checkVisibility({ match: 'any', conditions: [{ all: [{ field: '', operator: 'is_set' }] }] })), /all\[0\]\.field/)
    assert.deepEqual(normalizeVisibility({ match: 'any', conditions: [{ all: [] }, { all: [a, { bad: 1 }, b] }, c] }), { match: 'any', conditions: [{ all: [a, b] }, c] })
  })

  it('valueField compares with another field; it never comes with value', () => {
    assert.deepEqual(checkVisibility({ conditions: [{ field: 'sale', operator: 'less_than', valueField: ' price ' }] }), {
      conditions: [{ field: 'sale', operator: 'less_than', valueField: 'price' }],
    })
    assert.match(String(checkVisibility({ conditions: [{ field: 'sale', operator: 'less_than', valueField: 'price', value: 3 }] })), /not both/)
    assert.match(String(checkVisibility({ conditions: [{ field: 'sale', operator: 'less_than', valueField: '' }] })), /valueField/)
    // No value at all for is_set: valueField is dropped too.
    assert.deepEqual(checkVisibility({ conditions: [{ field: 'sale', operator: 'is_set', valueField: 'price' }] }), { conditions: [{ field: 'sale', operator: 'is_set' }] })
  })

  it('converts between the stored shape and "or" groups of "and" conditions', () => {
    const stored: BlockVisibility = { match: 'any', conditions: [{ all: [a, b] }, c] }
    assert.deepEqual(visibilityGroups(stored), [[a, b], [c]])
    assert.deepEqual(visibilityGroups({ conditions: [a, b] }), [[a, b]])
    assert.deepEqual(groupsVisibility([[a, b], [c]]), stored)
    assert.deepEqual(groupsVisibility([[a, b], []]), { conditions: [a, b] })
    assert.equal(groupsVisibility([]), undefined)
    assert.deepEqual(visibilityConditions(stored), [a, b, c])
  })
})

const anyOf = (conditions: BlockVisibility['conditions']): BlockVisibility => ({ match: 'any', conditions })
const when = (condition: object) => ({ conditions: [condition] }) as BlockVisibility

describe('isVisible with groups and other fields', () => {
  const product: TemplateContext = {
    collection: 'products',
    doc: { price: 120, salePrice: 90, stock: 0, featured: true, brand: { id: 'b1' }, maker: 'b1', tags: ['a', 'b'], other: ['c'], name: 'Desk lamp', words: 'lamp' },
  }

  it('one group must match fully; any group is enough', () => {
    const inStock = { field: 'stock', operator: 'greater_than' as const, value: 0 }
    const cheap = { field: 'price', operator: 'less_than' as const, value: 100 }
    const featured = { field: 'featured', operator: 'equals' as const, value: true }
    assert.equal(isVisible(product, anyOf([{ all: [inStock, cheap] }, featured])), true)
    assert.equal(isVisible(product, anyOf([{ all: [inStock, featured] }, cheap])), false)
    assert.equal(isVisible(product, { conditions: [{ all: [featured, cheap] }] } as BlockVisibility), false)
  })

  it('compares with another field: numbers, documents and ids, lists, text', () => {
    assert.equal(isVisible(product, when({ field: 'salePrice', operator: 'less_than', valueField: 'price' })), true)
    assert.equal(isVisible(product, when({ field: 'price', operator: 'less_than_equal', valueField: 'salePrice' })), false)
    assert.equal(isVisible(product, when({ field: 'brand', operator: 'equals', valueField: 'maker' })), true)
    assert.equal(isVisible(product, when({ field: 'brand', operator: 'not_equals', valueField: 'maker' })), false)
    assert.equal(isVisible(product, when({ field: 'tags', operator: 'in', valueField: 'other' })), false)
    assert.equal(isVisible(product, when({ field: 'tags', operator: 'not_in', valueField: 'other' })), true)
    assert.equal(isVisible(product, when({ field: 'name', operator: 'contains', valueField: 'words' })), true)
    // A missing other value never equals.
    assert.equal(isVisible(product, when({ field: 'name', operator: 'equals', valueField: 'missing' })), false)
    assert.equal(isVisible(product, when({ field: 'name', operator: 'not_equals', valueField: 'missing' })), true)
  })

  it('lists the fields both sides read', () => {
    assert.deepEqual(
      visibilityFieldPaths({ match: 'any', conditions: [{ all: [{ field: 'salePrice', operator: 'less_than', valueField: 'price' }, a] }, { field: '$index', operator: 'is_set' }] }),
      ['salePrice', 'price', 'a'],
    )
  })
})
