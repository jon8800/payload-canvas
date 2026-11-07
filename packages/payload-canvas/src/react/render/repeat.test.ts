import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { defaultBlocks } from '../../blocks'
import { LIST_ITEMS_PROP, type Block, type Layout, type TemplateContext } from '../../core'
import { resolveCanvasLayout } from '../canvas/resolveLayout'
import { attachListItems, RenderLayout, type ResolveLink } from '../index'

const blocks = defaultBlocks()
const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url?.trim() || null
  const doc = link.reference?.value as { slug?: string } | undefined
  return link.reference?.relationTo && doc?.slug ? `/${link.reference.relationTo}/${doc.slug}` : null
}
const render = (props: Parameters<typeof RenderLayout>[0]) =>
  renderToStaticMarkup(createElement(RenderLayout, { blocks, resolveLink, ...props }))

const image = (id: number) => ({ id, url: `/media/${id}.png`, filename: `${id}.png`, mimeType: 'image/png', alt: `Photo ${id}` })
const product: TemplateContext = {
  collection: 'products',
  doc: {
    id: 1,
    slug: 'desk-lamp',
    faqs: [
      { id: 'f1', question: 'First question', answer: 'First answer' },
      { id: 'f2', question: 'Second question', answer: 'Second answer' },
    ],
    photos: [image(7), image(8), image(9)],
    features: [{ id: 5, title: 'Dimmer', slug: 'dimmer' }],
    tags: ['brass', 'compact'],
  },
}

const faq: Block = {
  id: 'faq',
  type: 'repeat',
  props: { path: 'faqs' },
  slots: {
    item: [
      {
        id: 'row',
        type: 'stack',
        slots: {
          children: [
            { id: 'q', type: 'heading', props: { level: '3', text: 'Question' }, bindings: { text: 'question' } },
            { id: 'a', type: 'text', bindings: { text: 'answer' } },
            { id: 'n', type: 'text', bindings: { text: '$index' } },
          ],
        },
      },
    ],
  },
}
const layoutOf = (...list: Block[]): Layout => ({ version: 1, blocks: list })

describe('repeat rendering', () => {
  it('repeats the item for every row, bound to the row ($index from 1)', () => {
    const html = render({ layout: layoutOf(faq), context: product })
    for (const text of ['First question', 'First answer', 'Second question', 'Second answer']) assert.ok(html.includes(text), text)
    assert.match(html, />1<.*>2</s)
    assert.ok(!html.includes('>Question<'))
  })
  it('binds an image to $item in a list of uploads, after `offset`', () => {
    const photos: Block = {
      id: 'photos',
      type: 'repeat',
      props: { path: 'photos', offset: 1 },
      slots: { item: [{ id: 'img', type: 'image', bindings: { image: '$item' } }] },
    }
    const html = render({ layout: layoutOf(photos), context: product })
    assert.ok(!html.includes('/media/7.png'))
    assert.ok(html.includes('/media/8.png') && html.includes('/media/9.png'))
  })
  it('binds text to $item in a hasMany text list, and $url with the `collection` prop', () => {
    const tags: Block = { id: 't', type: 'repeat', props: { path: 'tags' }, slots: { item: [{ id: 'tx', type: 'text', bindings: { text: '$item' } }] } }
    const features: Block = {
      id: 's',
      type: 'repeat',
      props: { path: 'features', collection: 'features' },
      slots: { item: [{ id: 'lk', type: 'button', props: { label: 'Feature' }, bindings: { label: 'title', link: '$url' } }] },
    }
    const html = render({ layout: layoutOf(tags, features), context: product })
    assert.ok(html.includes('brass') && html.includes('compact'))
    assert.ok(html.includes('href="/features/dimmer"'))
    assert.ok(html.includes('Dimmer'))
  })
  it('renders inside a collection list item, against each listed document', () => {
    const list: Block = { id: 'l', type: 'collectionList', props: { collection: 'products' }, slots: { item: [faq] } }
    const docs = [
      { id: 2, faqs: [{ question: 'Q of two' }] },
      { id: 3, faqs: [{ question: 'Q of three' }, { question: 'Another of three' }] },
    ]
    const html = render({ layout: attachListItems(layoutOf(list), new Map([['l', docs]])) })
    for (const text of ['Q of two', 'Q of three', 'Another of three']) assert.ok(html.includes(text), text)
  })
  it('renders inside another repeat, against the row', () => {
    const outer: Block = { id: 'o', type: 'repeat', props: { path: 'groups' }, slots: { item: [{ ...faq, id: 'inner' }] } }
    const doc = { id: 1, groups: [{ faqs: [{ question: 'Nested one' }] }, { faqs: [{ question: 'Nested two' }] }] }
    const html = render({ layout: layoutOf(outer), context: { collection: 'products', doc } })
    assert.ok(html.includes('Nested one') && html.includes('Nested two'))
  })
  it('shows nothing on the site without a current document; the canvas shows the design once', () => {
    assert.ok(!render({ layout: layoutOf(faq) }).includes('Question'))
    const canvas = render({ layout: layoutOf(faq), mode: 'canvas' })
    assert.equal(canvas.match(/data-block-id="q"/g)?.length, 1)
    assert.ok(canvas.includes('Question'))
    assert.ok(!canvas.includes('data-builder-repeat'))
  })
  it('on the canvas the first row is editable and the others are repeats', () => {
    const canvas = render({ layout: layoutOf(faq), context: product, mode: 'canvas' })
    assert.equal(canvas.match(/data-block-id="q"/g)?.length, 1)
    assert.match(canvas, /data-block-id="faq" data-block-type="repeat" data-slot-owner="faq" data-slot="item"/)
    // The second row: stack, heading and two texts.
    assert.equal(canvas.match(/data-builder-repeat=""/g)?.length, 4)
    assert.ok(canvas.includes('Second question'))
  })
  it('as "none": the rows sit in the parent on the site; the canvas keeps a display: contents element', () => {
    const bare: Block = { ...faq, className: 'flex', props: { path: 'faqs', as: 'none' } }
    const grid: Block = { id: 'g', type: 'grid', className: 'grid', slots: { children: [bare] } }
    const html = render({ layout: layoutOf(grid), context: product })
    assert.match(html, /^<div class="grid builder-css"><div><h3>/)
    assert.equal(html.match(/<div/g)?.length, 3)
    assert.ok(html.includes('Second question'))
    const canvas = render({ layout: layoutOf(bare), context: product, mode: 'canvas' })
    assert.match(canvas, /^<div data-block-id="faq" data-block-type="repeat" data-slot-owner="faq" data-slot="item" style="display:contents">/)
    // The default keeps the wrapper with its classes.
    assert.match(render({ layout: layoutOf({ ...faq, className: 'flex' }), context: product }), /^<div class="flex builder-css">/)
  })
})

describe('canvas client resolution', () => {
  it('gives a repeat its rows from the sample document', async () => {
    const resolved = await resolveCanvasLayout(layoutOf(faq), product, '/api-repeat-test', blocks, resolveLink)
    assert.deepEqual(resolved.blocks[0].props?.[LIST_ITEMS_PROP], product.doc.faqs)
    assert.deepEqual(resolved.blocks[0].slots?.item, faq.slots?.item)
  })
})

describe('item bindings: $parent, $page and $index', () => {
  it('a repeat in a collection list item reads $parent (the listed document) and $page', () => {
    const repeat: Block = {
      id: 'r',
      type: 'repeat',
      props: { path: 'faqs' },
      slots: { item: [{ id: 't', type: 'text', bindings: { text: '{{question}} · {{$parent.title}} · {{$page.slug}} · {{$index}}' } }] },
    }
    const list: Block = { id: 'l', type: 'collectionList', props: { collection: 'products' }, slots: { item: [repeat] } }
    const docs = [{ id: 2, title: 'Bea', faqs: [{ question: 'Q1' }, { question: 'Q2' }] }]
    const html = render({ layout: attachListItems(layoutOf(list), new Map([['l', docs]])), context: product })
    assert.ok(html.includes('Q1 · Bea · desk-lamp · 1'))
    assert.ok(html.includes('Q2 · Bea · desk-lamp · 2'))
  })
})

const badge = (field: string, operator: 'is_set' | 'is_empty'): Block => ({
  id: 'b',
  type: 'text',
  props: { text: 'In stock' },
  visibility: { conditions: [{ field, operator }] },
})

describe('visibility conditions', () => {
  it('render the block only when the conditions match, also inside list items', () => {
    assert.ok(render({ layout: layoutOf(badge('slug', 'is_set')), context: product }).includes('In stock'))
    assert.ok(!render({ layout: layoutOf(badge('slug', 'is_empty')), context: product }).includes('In stock'))
    const list: Block = { id: 'l', type: 'collectionList', props: { collection: 'products' }, slots: { item: [badge('inStock', 'is_set')] } }
    const docs = [{ id: 2, inStock: true }, { id: 3, inStock: false }]
    const html = render({ layout: attachListItems(layoutOf(list), new Map([['l', docs]])) })
    assert.equal(html.match(/In stock/g)?.length, 1)
  })
  it('are not checked without a current document', () => {
    assert.ok(render({ layout: layoutOf(badge('slug', 'is_empty')) }).includes('In stock'))
  })
  it('mark a hidden block on the canvas instead of removing it', () => {
    const canvas = render({ layout: layoutOf(badge('slug', 'is_empty')), context: product, mode: 'canvas' })
    assert.match(canvas, /data-builder-hidden="true"/)
  })
})

describe('collection list empty slot', () => {
  const list: Block = {
    id: 'l',
    type: 'collectionList',
    props: { collection: 'products' },
    slots: { item: [{ id: 'h', type: 'heading', bindings: { text: 'title' } }], empty: [{ id: 'e', type: 'text', props: { text: 'No products found' } }] },
  }
  it('shows the empty slot instead of items when no document matches', () => {
    assert.ok(render({ layout: attachListItems(layoutOf(list), new Map([['l', []]])) }).includes('No products found'))
    const full = render({ layout: attachListItems(layoutOf(list), new Map([['l', [{ id: 2, title: 'Bea' }]]])) })
    assert.ok(full.includes('Bea'))
    assert.ok(!full.includes('No products'))
  })
})

const img = (id: string, props: Record<string, unknown> = {}): Block => ({ id, type: 'image', props: { image: image(Number(id.slice(1)) || 1), ...props } })
const section = (id: string, ...children: Block[]): Block => ({ id, type: 'stack', slots: { children } })
const eager = (html: string) => (html.match(/<img[^>]*loading="eager"/g) ?? []).length

describe('small block props', () => {
  it('image: priority, sizes and the focal point', () => {
    const doc = { ...image(7), width: 1200, height: 800, focalX: 30, focalY: 70, sizes: { card: { url: '/media/7-600.png', width: 600, height: 400 } } }
    const html = render({ layout: layoutOf({ id: 'i', type: 'image', props: { image: doc, priority: true, sizes: '50vw' } }) })
    assert.match(html, /loading="eager"/)
    assert.match(html, /fetchPriority="high"|fetchpriority="high"/)
    assert.match(html, /sizes="50vw"/)
    assert.match(html, /object-position:30% 70%/)
    const lazy = render({ layout: layoutOf({ id: 'i', type: 'image', props: { image: image(7) } }), priorityImages: 0 })
    assert.match(lazy, /loading="lazy"/)
  })
  it('image: the first images of the first section load first (priorityImages)', () => {
    const layout: Layout = { version: 1, blocks: [section('s1', img('i1'), img('i2')), section('s2', img('i3'))] }
    // Default 1: the first image of the first section.
    const html = render({ layout })
    assert.equal(eager(html), 1)
    assert.match(html, /<img src="\/media\/1.png"[^>]*loading="eager" fetchPriority="high"/)
    // Never past the first section, and 0 turns it off.
    assert.equal(eager(render({ layout, priorityImages: 5 })), 2)
    assert.equal(eager(render({ layout, priorityImages: 0 })), 0)
    // A hidden first block does not count as the first section.
    assert.equal(eager(render({ layout: { version: 1, blocks: [{ ...section('s0', img('i9')), hidden: true }, ...layout.blocks] } })), 1)
    // "Load first" off is kept, and the next image takes the place; one already on counts.
    const off = render({ layout: { version: 1, blocks: [section('s1', img('i1', { priority: false }), img('i2'))] } })
    assert.match(off, /<img src="\/media\/1.png"[^>]*loading="lazy"/)
    assert.match(off, /<img src="\/media\/2.png"[^>]*loading="eager"/)
    assert.equal(eager(render({ layout: { version: 1, blocks: [section('s1', img('i1', { priority: true }), img('i2'))] } })), 1)
    // Not in the editor.
    assert.equal(eager(render({ layout, mode: 'canvas' })), 0)
  })
  it('heading: the accent words render as <em>', () => {
    const html = render({ layout: layoutOf({ id: 'h', type: 'heading', props: { text: 'Lamps for every desk', accent: 'every desk', level: '1' } }) })
    assert.match(html, /<h1[^>]*>Lamps for <em>every desk<\/em><\/h1>/)
    const none = render({ layout: layoutOf({ id: 'h', type: 'heading', props: { text: 'Lamps', accent: 'Chairs' } }) })
    assert.ok(!none.includes('<em>'))
  })
  it('stack: list and figure tags', () => {
    const html = render({
      layout: layoutOf({ id: 's', type: 'stack', props: { as: 'ol' }, slots: { children: [{ id: 'li', type: 'stack', props: { as: 'li' }, slots: { children: [{ id: 't', type: 'text', props: { text: 'Step' } }] } }] } }),
    })
    assert.match(html, /<ol[^>]*><li[^>]*>/)
  })
})
