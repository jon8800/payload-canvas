import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'
import { defaultBlocks } from '../../blocks'
import type { Layout, TemplateContext } from '../../core'
import { attachListItems, listItemsOf, listQueries, loadLayoutData, RenderLayout, withDateTokens, type ResolveLink } from '../index'
import { loadTemplate } from '../server'

const blocks = defaultBlocks({ linkCollections: ['posts'] })
const render = (props: Parameters<typeof RenderLayout>[0]) =>
  renderToStaticMarkup(createElement(RenderLayout, { blocks, ...props }))

const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url?.trim() || null
  const doc = link.reference?.value as { slug?: string } | undefined
  return doc?.slug ? `/blog/${doc.slug}` : null
}

const image = { id: 7, url: '/media/a.png', filename: 'a.png', mimeType: 'image/png', alt: 'A', width: 10, height: 5 }
const content = { root: { type: 'root', children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: 'Body text', format: 0 }] }] } }
const post: TemplateContext = {
  collection: 'posts',
  doc: { id: 1, title: 'First', slug: 'first', excerpt: 'Intro', featuredImage: image, content, publishedAt: '2026-09-10T00:00:00.000Z', tags: [{ title: 'A' }, { title: 'B' }] },
}
const items = [
  { id: 2, title: 'Second', slug: 'second' },
  { id: 3, title: 'Third', slug: 'third' },
]

const template: Layout = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', props: { level: '1' }, bindings: { text: 'title' } },
    { id: 'img', type: 'image', bindings: { image: 'featuredImage' } },
    { id: 'body', type: 'field', props: { path: 'content' }, className: 'prose' },
    { id: 'date', type: 'field', props: { path: 'publishedAt' } },
    { id: 'tags', type: 'field', props: { path: 'tags' } },
    { id: 'none', type: 'field', props: { path: 'missing', fallback: 'Nothing' } },
    {
      id: 'list',
      type: 'collectionList',
      props: { collection: 'posts' },
      className: 'grid',
      slots: {
        item: [
          {
            id: 'card',
            type: 'link',
            bindings: { link: '$url' },
            slots: { children: [{ id: 'card-h', type: 'heading', props: { level: '3' }, bindings: { text: 'title' } }] },
          },
        ],
      },
    },
  ],
}

const withItems = attachListItems(template, new Map([['list', items]]))

const richBody = (className?: string) =>
  render({ layout: { version: 1, blocks: [{ id: 'b', type: 'field', props: { path: 'content' }, ...(className ? { className } : {}) }] }, context: post, resolveLink })

describe('RenderLayout with a template context', () => {
  const html = render({ layout: withItems, context: post, resolveLink })

  it('renders bound props and Field blocks by value type', () => {
    assert.match(html, /<h1>First<\/h1>/)
    assert.match(html, /<img src="\/media\/a.png" alt="A" width="10" height="5" loading="lazy"\/>/)
    assert.match(html, /<div class="prose builder-css"><p>Body text<\/p><\/div>/)
    assert.match(html, /<time dateTime="2026-09-10T00:00:00.000Z">Sep 10, 2026<\/time>/)
    assert.match(html, /<div>A, B<\/div>/)
    assert.match(html, /<div>Nothing<\/div>/)
  })

  it('gives rich text in a Field block the prose styles unless the block has them', () => {
    assert.equal(richBody(), '<div class="prose max-w-none builder-css"><p>Body text</p></div>')
    assert.equal(richBody('prose prose-lg'), '<div class="prose prose-lg builder-css"><p>Body text</p></div>')
    assert.match(richBody('mt-4'), /^<div class="mt-4 builder-css prose max-w-none builder-css">/)
    // Other values are not styled.
    assert.match(html, /<div>A, B<\/div>/)
  })

  it('renders the list item once per document, bound to that document', () => {
    assert.match(html, /<div class="grid builder-css"><a href="\/blog\/second"><h3>Second<\/h3><\/a><a href="\/blog\/third"><h3>Third<\/h3><\/a><\/div>/)
    assert.ok(!html.includes('data-'))
  })

  it('renders nothing for a list without documents on the site', () => {
    assert.ok(!render({ layout: template, context: post }).includes('class="grid builder-css"'))
  })

  it('renders bound blocks with their literal props without a context', () => {
    const page = render({ layout: { version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'Literal' }, bindings: { text: 'title' } }] } })
    assert.equal(page, '<h2>Literal</h2>')
  })
})

describe('canvas mode', () => {
  const html = render({ layout: withItems, context: post, resolveLink, mode: 'canvas' })

  it('puts editor attributes only on the first list item', () => {
    assert.equal(html.match(/data-block-id="card"/g)?.length, 1)
    assert.equal(html.match(/data-block-id="card-h"/g)?.length, 1)
    assert.equal(html.match(/data-builder-repeat=""/g)?.length, 2)
    assert.match(html, /data-block-id="list" data-block-type="collectionList" data-slot-owner="list" data-slot="item"/)
    // The repeat has no slot attributes.
    assert.equal(html.match(/data-slot-owner="card"/g)?.length, 1)
  })

  it('shows the item design once when there are no documents', () => {
    const empty = render({ layout: template, context: post, mode: 'canvas' })
    assert.match(empty, /data-block-id="card-h"/)
    assert.ok(!empty.includes('data-builder-repeat'))
  })

  it('shows a placeholder for a Field block without a value', () => {
    const empty = render({ layout: { version: 1, blocks: [{ id: 'f', type: 'field', props: { path: 'content' } }] }, mode: 'canvas' })
    assert.match(empty, /\{content\}/)
  })
})

const list = (props: Record<string, unknown>): Layout => ({ version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'products', ...props } }] })
const tag: TemplateContext = { collection: 'tags', doc: { id: 5, title: 'Outdoor' } }
const product: TemplateContext = {
  collection: 'products',
  doc: {
    id: 8,
    tags: [{ id: 5, title: 'Outdoor' }, 6, { relationTo: 'tags', value: { id: 7 } }, { relationTo: 'tags', value: 6 }],
    category: 'lighting',
    none: [],
  },
}
const whereOf = (props: Record<string, unknown>, context?: TemplateContext, url?: Parameters<typeof listQueries>[2]) => {
  const [query] = listQueries(list(props), context, url)
  return { where: query.where, none: query.none }
}

describe('listQueries', () => {
  it('reads limit and sort and leaves out the current document', () => {
    const layout: Layout = { version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts', limit: 500, sort: '-publishedAt' } }] }
    assert.deepEqual(listQueries(layout, post), [{ blockId: 'l', collection: 'posts', limit: 100, sort: '-publishedAt', exclude: 1 }])
    assert.deepEqual(listQueries(layout), [{ blockId: 'l', collection: 'posts', limit: 100, sort: '-publishedAt' }])
    const keep: Layout = { version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts', excludeCurrent: false } }] }
    assert.deepEqual(listQueries(keep, post), [{ blockId: 'l', collection: 'posts', limit: 3, sort: '-createdAt' }])
  })

  it("filters by the current document: the listed documents' field holds it", () => {
    assert.deepEqual(whereOf({ filterField: 'tags' }, tag), { where: { tags: { in: [5] } }, none: undefined })
    assert.deepEqual(whereOf({ filterField: ' tags ', filterBy: 'current' }, tag).where, { tags: { in: [5] } })
  })
  it('filters by shared values: ids of populated docs, pairs and primitives, without repeats', () => {
    assert.deepEqual(whereOf({ filterField: 'tags', filterBy: 'shared' }, product).where, { tags: { in: [5, 6, 7] } })
    assert.deepEqual(whereOf({ filterField: 'category', filterBy: 'shared' }, product).where, { category: { in: ['lighting'] } })
  })
  it("filters by linked documents: the current document's field points to them", () => {
    assert.deepEqual(whereOf({ filterField: 'tags', filterBy: 'linked' }, product).where, { id: { in: [5, 6, 7] } })
    const withCategory: TemplateContext = { collection: 'x', doc: { id: 1, category: { id: 'c1' } } }
    assert.deepEqual(whereOf({ filterField: 'category', filterBy: 'linked' }, withCategory).where, { id: { in: ['c1'] } })
  })
  it('lists no documents when shared or linked has no values', () => {
    assert.deepEqual(whereOf({ filterField: 'none', filterBy: 'shared' }, product), { where: undefined, none: true })
    assert.deepEqual(whereOf({ filterField: 'missing', filterBy: 'linked', where: { a: { equals: 1 } } }, product), { where: undefined, none: true })
  })
  it('lists nothing for filterField without a current document', () => {
    assert.deepEqual(whereOf({ filterField: 'categories' }), { where: undefined, none: true })
    assert.deepEqual(whereOf({ filterField: 'categories', filterBy: 'linked' }), { where: undefined, none: true })
  })
  it('adds URL query filters: values of one param OR-ed, params AND-ed, unknown values ignored', () => {
    const queryFilters = {
      featured: { yes: { featured: { equals: true } } },
      category: { news: { category: { equals: 'news' } }, guides: { category: { equals: 'guides' } } },
    }
    const where = (query: Record<string, string | string[]> | URLSearchParams | undefined) => whereOf({ queryFilters }, undefined, query).where
    assert.deepEqual(where({ featured: 'yes' }), { featured: { equals: true } })
    assert.deepEqual(where(new URLSearchParams('category=news&category=guides')), {
      or: [{ category: { equals: 'news' } }, { category: { equals: 'guides' } }],
    })
    assert.deepEqual(where({ category: 'news,guides', featured: 'yes' }), {
      and: [{ featured: { equals: true } }, { or: [{ category: { equals: 'news' } }, { category: { equals: 'guides' } }] }],
    })
    assert.equal(where({ category: 'recipes' }), undefined)
    // No query (the canvas): the filters are off.
    assert.equal(where(undefined), undefined)
  })
  it('turns $now date tokens into ISO dates, rounded to the minute', () => {
    const now = Date.parse('2026-10-21T10:15:42.000Z')
    assert.deepEqual(withDateTokens({ createdAt: { greater_than: '$now-30d' }, b: ['$now', '$now+12h', 'now'] }, now), {
      createdAt: { greater_than: '2026-09-21T10:15:00.000Z' },
      b: ['2026-10-21T10:15:00.000Z', '2026-10-21T22:15:00.000Z', 'now'],
    })
    const where = whereOf({ where: { createdAt: { greater_than: '$now-30d' } } }).where as { createdAt: { greater_than: string } }
    assert.match(where.createdAt.greater_than, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/)
  })
  it('reads offset and depth', () => {
    const [query] = listQueries(list({ offset: 2, depth: '2' }))
    assert.equal(query.offset, 2)
    assert.equal(query.depth, 2)
    const [plain] = listQueries(list({ offset: 0, depth: '1' }))
    assert.equal(plain.offset, undefined)
    assert.equal(plain.depth, undefined)
  })
  it('ANDs a static where with the filter; only a plain object counts', () => {
    const featured = { featured: { equals: true } }
    assert.deepEqual(whereOf({ where: featured }).where, featured)
    assert.deepEqual(whereOf({ where: featured, filterField: 'tags' }, tag).where, { and: [{ tags: { in: [5] } }, featured] })
    for (const bad of ['{"a":1}', [featured], 3, null, {}]) assert.equal(whereOf({ where: bad }).where, undefined)
  })
})

type Call = Record<string, unknown>

function matches(doc: Record<string, unknown>, where: Record<string, unknown>): boolean {
  const and = (where.and as Array<Record<string, { equals?: unknown; not_equals?: unknown; in?: unknown[] }>>) ?? [where]
  return and.every((cond) =>
    Object.entries(cond).every(([key, op]) => {
      if (!op) return true
      if ('equals' in op) return doc[key] === op.equals
      if ('not_equals' in op) return doc[key] !== op.not_equals
      if ('in' in op) return (op.in as unknown[]).includes(doc[key])
      return true
    }),
  )
}

function fakePayload(templates: Array<Record<string, unknown>>, calls: Call[] = [], posts?: Array<Record<string, unknown>>) {
  const data: Record<string, Array<Record<string, unknown>>> = {
    'builder-templates': templates,
    posts: posts ?? [{ id: 1, title: 'First', _status: 'published' }, ...items.map((i) => ({ ...i, _status: 'published' })), { id: 4, title: 'Draft', _status: 'draft' }],
    media: [image],
  }
  return {
    logger: { error() {} },
    collections: {
      'builder-templates': { config: { versions: { drafts: true } } },
      posts: { config: { versions: { drafts: true } } },
      media: { config: {} },
    },
    async findByID(args: Call) {
      calls.push({ op: 'findByID', ...args })
      const doc = data[args.collection as string].find((d) => d.id === args.id)
      if (!doc) throw new Error('Not Found')
      return doc
    },
    async find(args: Call) {
      calls.push({ op: 'find', ...args })
      // Payload refuses a query on an unknown field.
      if (JSON.stringify(args.where ?? {}).includes('"nope"')) throw new Error('The following path cannot be queried: nope')
      const docs = data[args.collection as string].filter((d) => matches(d, (args.where as Record<string, unknown>) ?? {}))
      return { docs: docs.slice(0, (args.limit as number) || docs.length) }
    },
  } as unknown as Payload
}

const tpl = (id: number, extra: Record<string, unknown>) => ({
  id,
  name: `T${id}`,
  targetCollection: 'posts',
  isDefault: false,
  _status: 'published',
  layout: { version: 1, blocks: [{ id: `b${id}`, type: 'heading', props: { text: `T${id}` } }] },
  layoutCss: { hash: 'x', css: `.t${id}{}` },
  ...extra,
})

describe('loadTemplate', () => {
  const own = tpl(1, {})
  const fallback = tpl(2, { isDefault: true })
  const payload = fakePayload([own, fallback, tpl(3, { isDefault: true, targetCollection: 'pages' })])

  it('uses the document\'s own template first', async () => {
    const found = await loadTemplate(payload, { collection: 'posts', doc: { id: 1, template: 1 } })
    assert.equal(found?.template.id, 1)
    assert.equal(found?.css, '.t1{}')
    assert.equal(found?.layout.blocks[0].id, 'b1')
  })
  it('accepts a populated template relationship', async () => {
    const found = await loadTemplate(payload, { collection: 'posts', doc: { id: 1, template: { id: 1 } } })
    assert.equal(found?.template.id, 1)
  })
  it('falls back to the default template of the collection', async () => {
    assert.equal((await loadTemplate(payload, { collection: 'posts', doc: { id: 1 } }))?.template.id, 2)
    assert.equal((await loadTemplate(payload, { collection: 'posts', doc: { id: 1, template: 99 } }))?.template.id, 2)
    assert.equal((await loadTemplate(payload, { collection: 'pages', doc: { id: 1 } }))?.template.id, 3)
  })
  it('ignores a template of another collection, unpublished or empty templates', async () => {
    const other = fakePayload([tpl(1, { targetCollection: 'pages' }), tpl(2, { isDefault: true, _status: 'draft' })])
    assert.equal(await loadTemplate(other, { collection: 'posts', doc: { template: 1 } }), null)
    assert.equal((await loadTemplate(other, { collection: 'posts', doc: {}, draft: true }))?.template.id, 2)
    const empty = fakePayload([tpl(1, { isDefault: true, layout: { version: 1, blocks: [] } })])
    assert.equal(await loadTemplate(empty, { collection: 'posts', doc: {} }), null)
  })
  it('skips an empty default and uses the next default (QA M13)', async () => {
    const both = fakePayload([tpl(5, { isDefault: true, layout: { version: 1, blocks: [] } }), tpl(6, { isDefault: true })])
    assert.equal((await loadTemplate(both, { collection: 'posts', doc: {} }))?.template.id, 6)
  })
  it('uses the most recently updated default first', async () => {
    const older = tpl(7, { isDefault: true, updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = tpl(8, { isDefault: true, updatedAt: '2026-02-01T00:00:00.000Z' })
    assert.equal((await loadTemplate(fakePayload([older, newer]), { collection: 'posts', doc: {} }))?.template.id, 8)
  })
  describe('conditions', () => {
    const news = tpl(10, { name: 'News', conditions: { category: { equals: 'news' } }, createdAt: '2026-01-01T00:00:00.000Z' })
    const newsToo = tpl(11, { name: 'A news too', conditions: { category: { equals: 'news' } }, createdAt: '2026-02-01T00:00:00.000Z' })
    const featured = tpl(12, { name: 'Featured', conditions: { featured: { equals: true } }, createdAt: '2026-03-01T00:00:00.000Z' })
    const posts = [
      { id: 1, category: 'news', featured: false },
      { id: 2, category: 'guides', featured: true },
      { id: 3, category: 'guides', featured: false },
    ]
    const site = fakePayload([own, newsToo, news, featured, fallback], [], posts)
    it('uses a template whose conditions match, before the default', async () => {
      assert.equal((await loadTemplate(site, { collection: 'posts', doc: { id: 1 } }))?.template.id, 10)
      assert.equal((await loadTemplate(site, { collection: 'posts', doc: { id: 2 } }))?.template.id, 12)
      assert.equal((await loadTemplate(site, { collection: 'posts', doc: { id: 3 } }))?.template.id, 2)
    })
    it('keeps the own template of the document first', async () => {
      assert.equal((await loadTemplate(site, { collection: 'posts', doc: { id: 1, template: 1 } }))?.template.id, 1)
    })
    it('picks the highest priority, then the older template; the name does not count', async () => {
      // Equal priority: the older one (10) wins, although "A news too" sorts first by name.
      assert.equal((await loadTemplate(site, { collection: 'posts', doc: { id: 1 } }))?.template.id, 10)
      const raised = fakePayload([news, { ...newsToo, priority: 5 }, fallback], [], posts)
      assert.equal((await loadTemplate(raised, { collection: 'posts', doc: { id: 1 } }))?.template.id, 11)
      const lowered = fakePayload([{ ...news, priority: -1 }, newsToo, fallback], [], posts)
      assert.equal((await loadTemplate(lowered, { collection: 'posts', doc: { id: 1 } }))?.template.id, 11)
    })
    it('reads the template list once, queries the document with each condition, and loads only the winner', async () => {
      const calls: Call[] = []
      await loadTemplate(fakePayload([news, featured, fallback], calls, posts), { collection: 'posts', doc: { id: 1 } })
      const lists = calls.filter((c) => c.collection === 'builder-templates' && c.op === 'find')
      assert.equal(lists.length, 1)
      assert.equal(lists[0].sort, 'createdAt')
      assert.ok(!('layout' in (lists[0].select as Record<string, unknown>)))
      const queries = calls.filter((c) => c.collection === 'posts')
      assert.deepEqual(
        queries.map((c) => c.where),
        [
          { and: [{ id: { equals: 1 } }, { category: { equals: 'news' } }] },
          { and: [{ id: { equals: 1 } }, { featured: { equals: true } }] },
        ],
      )
      assert.deepEqual(calls.filter((c) => c.op === 'findByID').map((c) => c.id), [10])
    })
    it('runs no match query when no template has conditions', async () => {
      const calls: Call[] = []
      const found = await loadTemplate(fakePayload([tpl(13, {}), fallback], calls, posts), { collection: 'posts', doc: { id: 1 } })
      assert.equal(found?.template.id, 2)
      assert.equal(calls.filter((c) => c.collection === 'posts').length, 0)
    })
    it('skips empty conditions, unpublished or empty templates, a failing query and documents without an id', async () => {
      const skipped = fakePayload(
        [
          tpl(20, { conditions: {} }),
          tpl(21, { conditions: { category: { equals: 'news' } }, _status: 'draft' }),
          tpl(22, { conditions: { category: { equals: 'news' } }, layout: { version: 1, blocks: [] } }),
          tpl(23, { conditions: { nope: { equals: 1 } } }),
          fallback,
        ],
        [],
        posts,
      )
      assert.equal((await loadTemplate(skipped, { collection: 'posts', doc: { id: 1 } }))?.template.id, 2)
      assert.equal((await loadTemplate(site, { collection: 'posts', doc: { category: 'news' } }))?.template.id, 2)
      // Draft mode: the latest draft of a template counts.
      assert.equal((await loadTemplate(skipped, { collection: 'posts', doc: { id: 1 }, draft: true }))?.template.id, 21)
    })
  })
  it('returns null when the app has no templates collection', async () => {
    const none = { collections: {} } as unknown as Payload
    assert.equal(await loadTemplate(none, { collection: 'posts', doc: {} }), null)
  })
})

describe('loadLayoutData', () => {
  it('resolves bindings, loads published list items without the current document, then loads IDs', async () => {
    const calls: Call[] = []
    const payload = fakePayload([], calls)
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: 'img', type: 'image', bindings: { image: 'featuredImage' } },
        { id: 'l', type: 'collectionList', props: { collection: 'posts', limit: 5 }, slots: { item: [{ id: 'x', type: 'heading', bindings: { text: 'title' } }] } },
      ],
    }
    const context: TemplateContext = { collection: 'posts', doc: { id: 1, featuredImage: 7 } }
    const loaded = await loadLayoutData(layout, blocks, payload, { context })
    // The bound ID became the loaded document.
    assert.deepEqual(loaded.blocks[0].props?.image, image)
    assert.equal(loaded.blocks[0].bindings, undefined)
    const listed = loaded.blocks[1].props?.$items as Array<{ id: number }>
    assert.deepEqual(listed.map((d) => d.id), [2, 3])
    const listCall = calls.find((c) => c.collection === 'posts')!
    assert.equal(listCall.depth, 1)
    // The visitor's access: anonymous by default, so private fields of related documents stay out.
    assert.equal(listCall.overrideAccess, false)
    assert.equal(listCall.user, null)
    assert.equal(listCall.limit, 5)
    assert.equal(listCall.sort, '-createdAt')
    // Item bindings stay for render time.
    assert.deepEqual(loaded.blocks[1].slots?.item?.[0]?.bindings, { text: 'title' })
  })
  it('loads list items with the given user', async () => {
    const calls: Call[] = []
    const user = { id: 9 }
    await loadLayoutData({ version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts' } }] }, blocks, fakePayload([], calls), { user })
    assert.equal(calls.find((c) => c.collection === 'posts')?.user, user)
  })
  it('adds the list filter to the query, and skips the query when it matches nothing', async () => {
    const calls: Call[] = []
    const payload = fakePayload([], calls)
    const context: TemplateContext = { collection: 'pages', doc: { id: 9, related: [] } }
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: 'a', type: 'collectionList', props: { collection: 'posts', filterField: 'pages', where: { featured: { equals: true } } } },
        { id: 'b', type: 'collectionList', props: { collection: 'posts', filterField: 'related', filterBy: 'linked' } },
      ],
    }
    const loaded = await loadLayoutData(layout, blocks, payload, { context })
    const listCalls = calls.filter((c) => c.collection === 'posts')
    assert.equal(listCalls.length, 1)
    assert.deepEqual(listCalls[0].where, {
      and: [{ and: [{ pages: { in: [9] } }, { featured: { equals: true } }] }, { _status: { equals: 'published' } }],
    })
    assert.equal(listCalls[0].overrideAccess, false)
    assert.deepEqual(loaded.blocks[1].props?.$items, [])
  })
  it('applies queryFilters from the query option, offset and depth', async () => {
    const calls: Call[] = []
    const layout: Layout = {
      version: 1,
      blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts', limit: 2, offset: 1, depth: '2', queryFilters: { tag: { a: { tag: { equals: 'a' } } } } } }],
    }
    const loaded = await loadLayoutData(layout, blocks, fakePayload([], calls), { query: { tag: 'a' } })
    const call = calls.find((c) => c.collection === 'posts')!
    assert.deepEqual(call.where, { and: [{ tag: { equals: 'a' } }, { _status: { equals: 'published' } }] })
    assert.equal(call.limit, 3)
    assert.equal(call.depth, 2)
    // The fake has no `tag` field, so nothing matches; without the filter the first document is skipped.
    assert.deepEqual(listItemsOf(loaded.blocks[0].props), [])
    const unfiltered = await loadLayoutData(layout, blocks, fakePayload([]), {})
    assert.deepEqual(listItemsOf(unfiltered.blocks[0].props).map((d) => d.id), [2, 3])
  })
  it('lists drafts in draft mode', async () => {
    const loaded = await loadLayoutData(
      { version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts', limit: 10 } }] },
      blocks,
      fakePayload([]),
      { draft: true },
    )
    assert.equal(listItemsOf(loaded.blocks[0].props).length, 4)
  })
})
