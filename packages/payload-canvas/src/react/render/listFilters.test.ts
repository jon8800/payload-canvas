import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block, Layout } from '../../core'
import { listQueries, queryFiltersOf } from './lists'

const list = (id: string, props: Record<string, unknown> = {}): Block => ({ id, type: 'collectionList', props: { collection: 'posts', ...props } })
const layoutOf = (...blocks: Block[]): Layout => ({ version: 1, blocks })

describe('queryFilters', () => {
  it('a field path means "the field equals the URL value"; several values are OR-ed', () => {
    assert.deepEqual(queryFiltersOf({ category: 'category' }, { category: 'news' }), [{ category: { equals: 'news' } }])
    assert.deepEqual(queryFiltersOf({ tag: 'tags.slug' }, new URLSearchParams('tag=css&tag=react')), [{ 'tags.slug': { in: ['css', 'react'] } }])
    assert.deepEqual(queryFiltersOf({ tag: 'tags' }, { tag: 'css,react' }), [{ tags: { in: ['css', 'react'] } }])
    // A missing param, an empty field: no filter.
    assert.deepEqual(queryFiltersOf({ category: 'category', tag: ' ' }, { tag: 'css' }), [])
  })

  it('the full form maps values to where queries, next to the short form', () => {
    const recent = { publishedAt: { greater_than: '$now-30d' } }
    const filters = { category: 'category', age: { recent, unknown: 'not a where' } }
    assert.deepEqual(queryFiltersOf(filters, { category: 'news', age: 'recent' }), [{ category: { equals: 'news' } }, recent])
    assert.deepEqual(queryFiltersOf(filters, { age: 'unknown' }), [])
  })

  it('list queries AND the URL filters with the rest', () => {
    const [query] = listQueries(layoutOf(list('l', { where: { featured: { equals: true } }, queryFilters: { category: 'category' } })), null, { category: 'news' })
    assert.deepEqual(query?.where, { and: [{ featured: { equals: true } }, { category: { equals: 'news' } }] })
  })
})

describe('listQueries', () => {
  it('leaves out lists in hidden blocks, unless the canvas asks for them', () => {
    const layout = layoutOf(
      list('shown'),
      { ...list('hidden'), hidden: true },
      { id: 's', type: 'stack', hidden: true, slots: { children: [list('inside')] } },
    )
    assert.deepEqual(listQueries(layout).map((q) => q.blockId), ['shown'])
    assert.deepEqual(listQueries(layout, null, null, { includeHidden: true }).map((q) => q.blockId), ['shown', 'hidden', 'inside'])
  })

  it('a list filtered by the current document shows nothing without one', () => {
    for (const filterBy of ['current', 'shared', 'linked']) {
      const [query] = listQueries(layoutOf(list('l', { filterField: 'categories', filterBy })), null)
      assert.equal(query?.none, true, filterBy)
    }
    // With a current document it filters.
    const [query] = listQueries(layoutOf(list('l', { filterField: 'categories' })), { collection: 'categories', doc: { id: 4 } })
    assert.deepEqual(query?.where, { categories: { in: [4] } })
    assert.equal(query?.none, undefined)
  })
})
