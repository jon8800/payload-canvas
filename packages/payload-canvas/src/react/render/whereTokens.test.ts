import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block, Layout, TemplateContext } from '../../core'
import { listQueries, resolveWhereTokens } from './lists'

const list = (id: string, props: Record<string, unknown> = {}): Block => ({ id, type: 'collectionList', props: { collection: 'posts', ...props } })
const layoutOf = (...blocks: Block[]): Layout => ({ version: 1, blocks })
const page: TemplateContext = {
  collection: 'posts',
  doc: { id: 5, title: 'Lamps', category: { id: 'c1', name: 'Lighting' }, tags: [{ id: 't1' }, 't2'], featured: false, empty: [] },
}

describe('where tokens', () => {
  it('a page field becomes its value: ids of documents, several values as "in"', () => {
    const sources = { context: page }
    assert.deepEqual(resolveWhereTokens({ category: { equals: '$page.category' } }, sources), { category: { equals: 'c1' } })
    assert.deepEqual(resolveWhereTokens({ tags: { equals: '$page.tags' } }, sources), { tags: { in: ['t1', 't2'] } })
    assert.deepEqual(resolveWhereTokens({ tags: { not_equals: '$page.tags' } }, sources), { tags: { not_in: ['t1', 't2'] } })
    assert.deepEqual(resolveWhereTokens({ tags: { in: '$page.category' } }, sources), { tags: { in: ['c1'] } })
    assert.deepEqual(resolveWhereTokens({ author: { equals: '$page.id' } }, sources), { author: { equals: 5 } })
    assert.deepEqual(resolveWhereTokens({ featured: { equals: '$page.featured' } }, sources), { featured: { equals: false } })
    assert.deepEqual(resolveWhereTokens({ name: { equals: '$page.category.name' } }, sources), { name: { equals: 'Lighting' } })
  })

  it('a missing page value matches nothing, except not_equals and not_in, which are left out', () => {
    assert.equal(resolveWhereTokens({ category: { equals: '$page.empty' } }, { context: page }), 'none')
    assert.equal(resolveWhereTokens({ category: { equals: '$page.title' }, other: { in: '$page.missing' } }, { context: page }), 'none')
    assert.equal(resolveWhereTokens({ category: { equals: '$page.category' } }, {}), 'none')
    assert.equal(resolveWhereTokens({ category: { not_in: '$page.empty' } }, { context: page }), undefined)
    assert.deepEqual(resolveWhereTokens({ category: { not_equals: '$page.empty', exists: true } }, { context: page }), { category: { exists: true } })
  })

  it('a URL value becomes the value; without one the condition is left out', () => {
    const query = new URLSearchParams('tag=css&tag=react&q=lamp')
    assert.deepEqual(resolveWhereTokens({ title: { like: '$query.q' } }, { query }), { title: { like: 'lamp' } })
    assert.deepEqual(resolveWhereTokens({ tags: { equals: '$query.tag' } }, { query }), { tags: { in: ['css', 'react'] } })
    assert.equal(resolveWhereTokens({ tags: { equals: '$query.missing' } }, { query }), undefined)
    assert.equal(resolveWhereTokens({ tags: { equals: '$query.tag' } }, {}), undefined)
  })

  it('groups: "and" fails with one part; in "or" a part that matches nothing or is left out does not apply', () => {
    const sources = { context: page }
    assert.equal(resolveWhereTokens({ and: [{ a: { equals: 1 } }, { b: { equals: '$page.empty' } }] }, sources), 'none')
    assert.deepEqual(resolveWhereTokens({ or: [{ a: { equals: 1 } }, { b: { equals: '$page.empty' } }] }, sources), { or: [{ a: { equals: 1 } }] })
    assert.deepEqual(resolveWhereTokens({ or: [{ a: { equals: 1 } }, { b: { equals: '$query.x' } }] }, sources), { or: [{ a: { equals: 1 } }] })
    assert.equal(resolveWhereTokens({ or: [{ b: { equals: '$page.empty' } }] }, sources), 'none')
    assert.equal(resolveWhereTokens({ or: [{ b: { equals: '$query.x' } }] }, sources), undefined)
  })

  it('leaves other values and keys alone, and ANDs a turned "in" with an existing one', () => {
    const where = { a: { near: [1, 2] }, b: { equals: '$pages' }, c: { greater_than: '$now-1d' } }
    assert.deepEqual(resolveWhereTokens(where, { context: page }), where)
    assert.deepEqual(resolveWhereTokens({ tags: { in: ['x'], equals: '$page.tags' } }, { context: page }), {
      tags: { in: ['x'] },
      and: [{ tags: { in: ['t1', 't2'] } }],
    })
  })

  it('list queries read the tokens with the page and the URL, and skip lists that match nothing', () => {
    const layout = layoutOf(
      list('a', { where: { category: { equals: '$page.category' } } }),
      list('b', { where: { category: { equals: '$page.empty' } } }),
      list('c', { where: { tags: { in: '$query.tag' } } }),
    )
    const [a, b, c] = listQueries(layout, page, { tag: 'css' })
    assert.deepEqual(a?.where, { category: { equals: 'c1' } })
    assert.equal(b?.none, true)
    assert.equal(b?.where, undefined)
    assert.deepEqual(c?.where, { tags: { in: ['css'] } })
    // The canvas has no URL: the URL condition is left out, the same as on the site without the parameter.
    const [, , canvas] = listQueries(layout, page, null)
    assert.equal(canvas?.where, undefined)
  })
})
