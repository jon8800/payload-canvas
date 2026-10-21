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
const model: TemplateContext = {
  collection: 'models',
  doc: {
    id: 1,
    slug: 'ada',
    faqs: [
      { id: 'f1', question: 'First question', answer: 'First answer' },
      { id: 'f2', question: 'Second question', answer: 'Second answer' },
    ],
    galleryImages: [image(7), image(8), image(9)],
    services: [{ id: 5, title: 'Dinner', slug: 'dinner' }],
    tags: ['tall', 'blonde'],
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
    const html = render({ layout: layoutOf(faq), context: model })
    for (const text of ['First question', 'First answer', 'Second question', 'Second answer']) assert.ok(html.includes(text), text)
    assert.match(html, />1<.*>2</s)
    assert.ok(!html.includes('>Question<'))
  })
  it('binds an image to $item in a list of uploads, after `offset`', () => {
    const photos: Block = {
      id: 'photos',
      type: 'repeat',
      props: { path: 'galleryImages', offset: 1 },
      slots: { item: [{ id: 'img', type: 'image', bindings: { image: '$item' } }] },
    }
    const html = render({ layout: layoutOf(photos), context: model })
    assert.ok(!html.includes('/media/7.png'))
    assert.ok(html.includes('/media/8.png') && html.includes('/media/9.png'))
  })
  it('binds text to $item in a hasMany text list, and $url with the `collection` prop', () => {
    const tags: Block = { id: 't', type: 'repeat', props: { path: 'tags' }, slots: { item: [{ id: 'tx', type: 'text', bindings: { text: '$item' } }] } }
    const services: Block = {
      id: 's',
      type: 'repeat',
      props: { path: 'services', collection: 'services' },
      slots: { item: [{ id: 'lk', type: 'button', props: { label: 'Service' }, bindings: { label: 'title', link: '$url' } }] },
    }
    const html = render({ layout: layoutOf(tags, services), context: model })
    assert.ok(html.includes('tall') && html.includes('blonde'))
    assert.ok(html.includes('href="/services/dinner"'))
    assert.ok(html.includes('Dinner'))
  })
  it('renders inside a collection list item, against each listed document', () => {
    const list: Block = { id: 'l', type: 'collectionList', props: { collection: 'models' }, slots: { item: [faq] } }
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
    const html = render({ layout: layoutOf(outer), context: { collection: 'models', doc } })
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
    const canvas = render({ layout: layoutOf(faq), context: model, mode: 'canvas' })
    assert.equal(canvas.match(/data-block-id="q"/g)?.length, 1)
    assert.match(canvas, /data-block-id="faq" data-block-type="repeat" data-slot-owner="faq" data-slot="item"/)
    // The second row: stack, heading and two texts.
    assert.equal(canvas.match(/data-builder-repeat=""/g)?.length, 4)
    assert.ok(canvas.includes('Second question'))
  })
})

describe('canvas client resolution', () => {
  it('gives a repeat its rows from the sample document', async () => {
    const resolved = await resolveCanvasLayout(layoutOf(faq), model, '/api-repeat-test', blocks, resolveLink)
    assert.deepEqual(resolved.blocks[0].props?.[LIST_ITEMS_PROP], model.doc.faqs)
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
    const list: Block = { id: 'l', type: 'collectionList', props: { collection: 'models' }, slots: { item: [repeat] } }
    const docs = [{ id: 2, title: 'Bea', faqs: [{ question: 'Q1' }, { question: 'Q2' }] }]
    const html = render({ layout: attachListItems(layoutOf(list), new Map([['l', docs]])), context: model })
    assert.ok(html.includes('Q1 · Bea · ada · 1'))
    assert.ok(html.includes('Q2 · Bea · ada · 2'))
  })
})

const badge = (condition: string): Block => ({ id: 'b', type: 'text', props: { text: 'Available today' }, bindings: { $visible: condition } })

describe('$visible', () => {
  it('renders the block only when the condition holds, also inside list items', () => {
    assert.ok(render({ layout: layoutOf(badge('slug')), context: model }).includes('Available today'))
    assert.ok(!render({ layout: layoutOf(badge('!slug')), context: model }).includes('Available today'))
    const list: Block = { id: 'l', type: 'collectionList', props: { collection: 'models' }, slots: { item: [badge('availableToday')] } }
    const docs = [{ id: 2, availableToday: true }, { id: 3, availableToday: false }]
    const html = render({ layout: attachListItems(layoutOf(list), new Map([['l', docs]])) })
    assert.equal(html.match(/Available today/g)?.length, 1)
  })
  it('marks a hidden block on the canvas instead of removing it', () => {
    const canvas = render({ layout: layoutOf(badge('!slug')), context: model, mode: 'canvas' })
    assert.match(canvas, /data-builder-hidden="true"/)
  })
})
