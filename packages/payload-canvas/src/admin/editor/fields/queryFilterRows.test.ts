import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { queryFilterRows, rowsQueryFilters } from './queryFilterRows'

describe('queryFilterRows', () => {
  it('reads the short form as rows, and nothing as no rows', () => {
    assert.deepEqual(queryFilterRows(undefined), [])
    assert.deepEqual(queryFilterRows(null), [])
    assert.deepEqual(queryFilterRows({ category: 'category', tag: 'tags.slug' }), [
      { param: 'category', field: 'category' },
      { param: 'tag', field: 'tags.slug' },
    ])
  })

  it('returns null for the full form, so the field shows JSON', () => {
    assert.equal(queryFilterRows({ category: 'category', age: { recent: { publishedAt: { greater_than: '$now-30d' } } } }), null)
    assert.equal(queryFilterRows('category'), null)
    assert.equal(queryFilterRows([]), null)
  })

  it('writes the rows back, leaving out rows without a parameter', () => {
    assert.deepEqual(rowsQueryFilters([{ param: ' category ', field: 'category ' }, { param: '', field: 'tags' }]), { category: 'category' })
    assert.equal(rowsQueryFilters([]), undefined)
    const value = { category: 'category', tag: 'tags' }
    assert.deepEqual(rowsQueryFilters(queryFilterRows(value)!), value)
  })
})
