import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'

import { builtinBlocks, defaultBlocks, filterHref } from '../../blocks'
import type { Block, Layout } from '../../core'
import { loadLayoutData, RenderLayout } from '../index'
import { LIST_PAGE_PARAMS_PROP, listQueries, loadedLists, pageLinks, pageParamOf, pageWindow, withPageParams } from './lists'

const blocks = [...defaultBlocks(), ...builtinBlocks({ include: ['filterLink'] })]
const docs = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, title: `Doc ${i + 1}` }))
const list = (id: string, props: Record<string, unknown>): Block => ({
  id,
  type: 'collectionList',
  props: { collection: 'posts', limit: 2, paginate: 'pages', ...props },
  slots: { item: [{ id: `${id}_t`, type: 'text', bindings: { text: 'title' } }] },
})
const filter: Block = { id: 'f', type: 'filterLink', props: { param: 'available', value: 'today' } }

function fakePayload() {
  return {
    logger: { error() {} },
    collections: { posts: { config: {} } },
    async find(args: { limit?: number; page?: number }) {
      const limit = args.limit ?? docs.length
      const page = args.page ?? 1
      return { docs: docs.slice((page - 1) * limit, page * limit), totalPages: Math.ceil(docs.length / limit) }
    },
  } as unknown as Payload
}

describe('pager', () => {
  it('long page lists show the first, the last and the pages around the current one', () => {
    assert.deepEqual(pageWindow(5, 20), [1, 4, 5, 6, 20])
    assert.deepEqual(pageWindow(1, 20), [1, 2, 20])
    assert.deepEqual(pageWindow(20, 20), [1, 19, 20])
    // A gap of one page shows that page.
    assert.deepEqual(pageWindow(4, 20), [1, 2, 3, 4, 5, 20])
    assert.deepEqual(pageWindow(3, 7), [1, 2, 3, 4, 5, 6, 7])
    const links = pageLinks(null, 5, 20).links
    assert.deepEqual(links.map((l) => [l.page, l.gapBefore ?? false]), [[1, false], [4, true], [5, false], [6, false], [20, true]])
  })

  it('a list with its own pageParam reads and writes that parameter and keeps the others', () => {
    assert.equal(pageParamOf({ pageParam: ' reviewsPage ' }), 'reviewsPage')
    assert.equal(pageParamOf({ pageParam: 'bad param' }), 'page')
    assert.equal(pageParamOf({}), 'page')
    const [main, reviews] = listQueries({ version: 1, blocks: [list('a', {}), list('b', { pageParam: 'rp' })] }, null, { page: '3', rp: '2' })
    assert.equal(main!.page, 3)
    assert.equal(main!.pageParam, undefined)
    assert.equal(reviews!.page, 2)
    assert.equal(reviews!.pageParam, 'rp')
    assert.deepEqual(pageLinks({ page: '3', rp: '2' }, 2, 3, 'rp').links.map((l) => l.href), ['?page=3', '?page=3&rp=2', '?page=3&rp=3'])
  })

  it('filter links drop page and the page parameters of the layout\'s lists', async () => {
    const layout: Layout = { version: 1, blocks: [filter, list('a', {}), list('b', { pageParam: 'rp' })] }
    const loaded = await loadLayoutData(layout, blocks, fakePayload(), { query: { page: '2', rp: '4' } })
    assert.deepEqual(loaded.blocks[0]!.props?.[LIST_PAGE_PARAMS_PROP], ['rp'])
    assert.equal(filterHref('/x', { page: '2', rp: '4', hair: 'red' }, { param: 'available', value: 'today', pageParams: ['rp'] }).href, '/x?hair=red&available=today')
    // Without lists of their own parameter, nothing is added.
    const plain: Layout = { version: 1, blocks: [filter, list('a', {})] }
    assert.equal(withPageParams(plain, listQueries(plain)), plain)
  })

  it('renders gaps as hidden spans and names the page links', async () => {
    const loaded = await loadLayoutData({ version: 1, blocks: [list('a', { pagerLabel: 'Seiten' })] }, blocks, fakePayload(), { query: { page: '10' } })
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: loaded, blocks }))
    assert.match(html, /<nav aria-label="Seiten"[^>]*><a href="\?">1<\/a><span data-page-gap="" aria-hidden="true">…<\/span><a href="\?page=9">9<\/a><a href="\?page=10" aria-current="page">10<\/a><a href="\?page=11">11<\/a><span data-page-gap="" aria-hidden="true">…<\/span><a href="\?page=20">20<\/a><\/nav>/)
    const english = await loadLayoutData({ version: 1, blocks: [list('a', {})] }, blocks, fakePayload())
    assert.match(renderToStaticMarkup(createElement(RenderLayout, { layout: english, blocks })), /<nav aria-label="Pages"/)
  })
})

describe('loadedLists', () => {
  it('lists the documents each collection list of a loaded layout shows, without a second query', async () => {
    let calls = 0
    const payload = fakePayload()
    const counting = { ...payload, find: async (args: { limit?: number; page?: number }) => (calls++, payload.find(args as never)) } as unknown as Payload
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: 's', type: 'stack', slots: { children: [list('a', { paginate: 'none', limit: 3 })] } },
        { ...list('hid', {}), hidden: true },
      ],
    }
    const loaded = await loadLayoutData(layout, blocks, counting)
    const before = calls
    const lists = loadedLists(loaded)
    assert.equal(calls, before)
    assert.deepEqual(lists.map((l) => [l.blockId, l.collection, l.docs.map((d) => d.id)]), [['a', 'posts', [1, 2, 3]]])
    assert.deepEqual(loadedLists(layout), [])
  })
})
