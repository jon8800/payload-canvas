import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'

import { defaultBlocks } from '../../blocks'
import type { Block, Layout } from '../../core'
import { listCollectionsOf } from '../../plugin/listCollections'
import { loadLayoutData, RenderLayout } from '../index'
import { arrangeListDocs, listQueries, pageLinks, pageOf, type ListQuery } from './lists'

const blocks = defaultBlocks()
const docs = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `Doc ${i + 1}` }))
const list = (props: Record<string, unknown>): Block => ({
  id: 'l',
  type: 'collectionList',
  props: { collection: 'posts', limit: 3, ...props },
  slots: { item: [{ id: 't', type: 'text', bindings: { text: 'title' } }] },
})
const layoutOf = (block: Block): Layout => ({ version: 1, blocks: [block] })

type Call = { where?: unknown; limit?: number; page?: number; sort?: string }
function fakePayload(calls: Call[]) {
  return {
    logger: { error() {} },
    collections: { posts: { config: {} } },
    async find(args: Call & { collection: string }) {
      calls.push(args)
      const where = JSON.stringify(args.where ?? {})
      const ids = /"in":\[([^\]]*)\]/.exec(where)?.[1]?.split(',').map(Number)
      const all = ids ? docs.filter((d) => ids.includes(d.id)) : docs
      const limit = args.limit ?? all.length
      const page = args.page ?? 1
      return { docs: all.slice((page - 1) * limit, page * limit), totalPages: Math.ceil(all.length / limit) }
    },
  } as unknown as Payload
}

describe('collection list picks, random order and pages', () => {
  it('ids: only the picked documents, in pick order', async () => {
    const [query] = listQueries(layoutOf(list({ ids: [{ relationTo: 'posts', value: 5 }, 2, { relationTo: 'pages', value: 3 }, { id: 7 }] })))
    assert.deepEqual(query?.ids, [5, 2, 7])
    const loaded = await loadLayoutData(layoutOf(list({ ids: [5, 2, 7] })), blocks, fakePayload([]))
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: loaded, blocks }))
    assert.ok(html.indexOf('Doc 5') < html.indexOf('Doc 2') && html.indexOf('Doc 2') < html.indexOf('Doc 7'))
  })
  it('$random: the same seed gives the same order, and limit applies', () => {
    const query: ListQuery = { blockId: 'l', collection: 'posts', limit: 3, sort: '$random', random: true }
    const a = arrangeListDocs(docs, query, 42).map((d) => d.id)
    assert.deepEqual(arrangeListDocs(docs, query, 42).map((d) => d.id), a)
    assert.equal(a.length, 3)
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => arrangeListDocs(docs, query, seed).map((d) => d.id).join()))
    assert.ok(orders.size > 1)
    assert.equal(listQueries(layoutOf(list({ sort: '$random' })))[0]?.random, true)
  })
  it('pages: ?page=N loads that page and renders crawlable links that keep the other params', async () => {
    assert.equal(pageOf(new URLSearchParams('page=3')), 3)
    assert.equal(pageOf({ page: 'x' }), 1)
    assert.deepEqual(pageLinks({ available: 'today', page: '2' }, 2, 3).links.map((l) => [l.href, l.current]), [
      ['?available=today', false],
      ['?available=today&page=2', true],
      ['?available=today&page=3', false],
    ])
    assert.deepEqual(pageLinks(null, 1, 1).links, [])
    const calls: Call[] = []
    const loaded = await loadLayoutData(layoutOf(list({ paginate: 'pages' })), blocks, fakePayload(calls), { query: { page: '2' } })
    assert.equal(calls[0]?.page, 2)
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: loaded, blocks }))
    assert.ok(html.includes('Doc 4') && !html.includes('Doc 1<'))
    assert.match(html, /<nav aria-label="Pages" class="flex flex-wrap gap-2 builder-css"><a href="\?">1<\/a><a href="\?page=2" aria-current="page">2<\/a><a href="\?page=3">3<\/a><\/nav>/)
  })
  it('pages with a path: page 1 is the bare path, or the path with the other params', async () => {
    assert.deepEqual(pageLinks({ page: '2' }, 2, 3, undefined, '/guides').links.map((l) => l.href), ['/guides', '/guides?page=2', '/guides?page=3'])
    assert.deepEqual(pageLinks({ available: 'today', page: '2' }, 2, 2, undefined, '/escorts').links.map((l) => l.href), ['/escorts?available=today', '/escorts?available=today&page=2'])
    const loaded = await loadLayoutData(layoutOf(list({ paginate: 'pages' })), blocks, fakePayload([]), { query: { page: '2' }, path: '/guides' })
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: loaded, blocks }))
    assert.match(html, /<a href="\/guides">1<\/a><a href="\/guides\?page=2" aria-current="page">2<\/a>/)
  })
  it('the plugin turns ids into a relationship to the listable collections', () => {
    const def = listCollectionsOf(blocks, ['posts', 'models']).find((b) => b.type === 'collectionList')
    const ids = def?.fields.find((f) => 'name' in f && f.name === 'ids') as { type: string; relationTo: unknown } | undefined
    assert.equal(ids?.type, 'relationship')
    assert.deepEqual(ids?.relationTo, ['posts', 'models'])
  })
})
