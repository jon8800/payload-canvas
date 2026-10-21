import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import {
  bindingPaths,
  bindingValue,
  isVisible,
  itemSources,
  listItemContext,
  LIST_ITEMS_PROP,
  repeatRowContext,
  repeatRows,
  resolveBindings,
  resolveBlockBindings,
  scopeSources,
  validateBindings,
} from './bindings'
import type { BindingField, Block, Layout, TemplateContext } from './types'

const blocks = defaultBlocks()

const image = { id: 7, url: '/media/a.png', filename: 'a.png', mimeType: 'image/png' }
const model: TemplateContext = {
  collection: 'models',
  doc: {
    id: 1,
    name: 'Ada',
    heading: '',
    bio: 'Warm and witty. Loves jazz.',
    price: 1200,
    publishedAt: '2026-09-10T22:30:00.000Z',
    availableToday: true,
    newThisMonth: false,
    district: 'north',
    services: [{ id: 5, title: 'Dinner' }, { id: 6, title: 'Travel' }],
    faqs: [
      { id: 'f1', question: 'Q1', answer: 'A1' },
      { id: 'f2', question: 'Q2', answer: 'A2' },
    ],
    galleryImages: [image, { ...image, id: 8 }, { ...image, id: 9 }],
    tags: ['tall', 'blonde'],
  },
}

const repeat = (props: Record<string, unknown>, item: Block[] = []): Block => ({ id: 'r', type: 'repeat', props, slots: { item } })
const ids = (props: Record<string, unknown>) =>
  repeatRows(model, { path: 'galleryImages', ...props }).map((row) => (row as { id: number }).id)

describe('repeatRows', () => {
  it('reads array rows, hasMany documents and values', () => {
    assert.deepEqual(repeatRows(model, { path: 'faqs' }), model.doc.faqs)
    assert.deepEqual(repeatRows(model, { path: 'tags' }), ['tall', 'blonde'])
    assert.deepEqual(repeatRows(model, { path: 'name' }), ['Ada'])
    assert.deepEqual(repeatRows(model, { path: 'missing' }), [])
    assert.deepEqual(repeatRows(model, { path: '' }), [])
  })
  it('skips `offset` rows and keeps `limit` rows', () => {
    assert.deepEqual(ids({ offset: 1 }), [8, 9])
    assert.deepEqual(ids({ limit: 2 }), [7, 8])
    assert.deepEqual(ids({ offset: 1, limit: 1 }), [8])
    assert.deepEqual(ids({ offset: -1, limit: 0 }), [7, 8, 9])
  })
  it('reads $parent and $page paths', () => {
    const row = repeatRowContext({ id: 'x', items: [1, 2] }, 0, model)
    assert.deepEqual(repeatRows(row, { path: 'items' }), [1, 2])
    assert.deepEqual(repeatRows(row, { path: '$parent.tags' }), ['tall', 'blonde'])
    assert.deepEqual(repeatRows(row, { path: '$page.tags' }), ['tall', 'blonde'])
  })
})

describe('row and item contexts', () => {
  it('a row binds to its fields, $item, $index, $parent and $page', () => {
    const row = repeatRowContext({ id: 'f1', question: 'Q1' }, 0, model, 'services')
    assert.equal(row.collection, 'services')
    assert.deepEqual(row.doc, { id: 'f1', question: 'Q1' })
    assert.equal(bindingValue(row, 'question'), 'Q1')
    assert.deepEqual(bindingValue(row, '$item'), { id: 'f1', question: 'Q1' })
    assert.equal(bindingValue(row, '$index'), 1)
    assert.equal(bindingValue(row, '$parent.name'), 'Ada')
    assert.equal(bindingValue(row, '$page.name'), 'Ada')
    assert.equal(bindingValue(repeatRowContext('tall', 1, model), '$item'), 'tall')
    assert.equal(bindingValue(repeatRowContext('tall', 1, model), '$index'), 2)
  })
  it('$page stays the page inside nested items; $parent is the nearest document', () => {
    const listed = listItemContext({ id: 2, name: 'Bea', faqs: [{ question: 'Q' }] }, 0, model, 'models')
    const row = repeatRowContext({ question: 'Q' }, 0, listed)
    assert.equal(bindingValue(listed, '$page.name'), 'Ada')
    assert.equal(bindingValue(row, '$parent.name'), 'Bea')
    assert.equal(bindingValue(row, '$page.name'), 'Ada')
    // At the top, $page is the document itself.
    assert.equal(bindingValue(model, '$page.name'), 'Ada')
  })
  it('opens a { relationTo, value } row on its own collection', () => {
    const row = repeatRowContext({ relationTo: 'services', value: { id: 5, slug: 'dinner' } }, 0, model)
    assert.equal(row.collection, 'services')
    assert.equal(row.doc.slug, 'dinner')
    assert.deepEqual(row.item, { id: 5, slug: 'dinner' })
  })
})

describe('binding expressions', () => {
  it('fallback chains take the first value that is not missing', () => {
    assert.equal(bindingValue(model, 'heading|name'), 'Ada')
    assert.equal(bindingValue(model, 'missing|heading'), '')
    assert.equal(bindingValue(model, 'missing|other'), undefined)
  })
  it('formatters: date, currency, number, firstSentence', () => {
    assert.equal(bindingValue(model, 'publishedAt|date:en-AU:Australia/Brisbane'), '11 Sept 2026')
    assert.equal(bindingValue(model, 'publishedAt|date'), 'Sep 10, 2026')
    assert.equal(bindingValue(model, 'price|currency:AUD'), '$1,200')
    assert.equal(bindingValue({ collection: 'x', doc: { price: 99.5 } }, 'price|currency:AUD'), '$99.50')
    assert.equal(bindingValue(model, 'price|number'), '1,200')
    assert.equal(bindingValue(model, 'bio|firstSentence'), 'Warm and witty.')
    assert.equal(bindingValue(model, 'missing|currency:AUD'), undefined)
  })
  it('template strings put each expression in the text', () => {
    assert.equal(bindingValue(model, 'Enquire about {{name}}'), 'Enquire about Ada')
    assert.equal(bindingValue(model, '{{name}} from {{price|currency:AUD}}'), 'Ada from $1,200')
    assert.equal(bindingValue(model, '{{name}}{{missing}}'), 'Ada')
    // Every expression missing: the literal prop stays.
    assert.equal(bindingValue(model, 'Photos of {{missing}}'), undefined)
  })
  it('a template string binds a prop', () => {
    const block: Block = { id: 'h', type: 'heading', props: { text: 'Enquire' }, bindings: { text: 'Enquire about {{name}}' } }
    assert.equal(resolveBlockBindings(block, model, blocks.find((b) => b.type === 'heading')).props?.text, 'Enquire about Ada')
  })
  it('lists the plain paths a binding reads', () => {
    assert.deepEqual(bindingPaths('text', 'heading|name'), ['heading', 'name'])
    assert.deepEqual(bindingPaths('text', 'Hi {{name}}, {{price|currency:AUD}} {{$item}}'), ['name', 'price'])
    assert.deepEqual(bindingPaths('$visible', '!availableToday'), ['availableToday'])
    assert.deepEqual(bindingPaths('$visible', 'district=north'), ['district'])
  })
})

describe('$visible', () => {
  it('filled, empty, equals and differs', () => {
    assert.equal(isVisible(model, 'availableToday'), true)
    assert.equal(isVisible(model, 'newThisMonth'), false)
    assert.equal(isVisible(model, '!newThisMonth'), true)
    assert.equal(isVisible(model, '!heading'), true)
    assert.equal(isVisible(model, 'district=north'), true)
    assert.equal(isVisible(model, 'district=south'), false)
    assert.equal(isVisible(model, 'district!=south'), true)
    assert.equal(isVisible(model, 'services=6'), true)
    assert.equal(isVisible(model, 'tags=tall'), true)
  })
  it('hides the block when the condition fails, and is applied once', () => {
    const block: Block = { id: 'b', type: 'text', props: { text: 'New' }, bindings: { $visible: 'newThisMonth' } }
    const hidden = resolveBlockBindings(block, model, undefined)
    assert.equal(hidden.hidden, true)
    assert.equal(hidden.bindings, undefined)
    const shown = resolveBlockBindings({ ...block, bindings: { $visible: 'availableToday' } }, model, undefined)
    assert.equal(shown.hidden, undefined)
  })
})

describe('resolveBindings with a repeat', () => {
  it('attaches the rows and leaves the item design for render time', () => {
    const item: Block[] = [{ id: 'q', type: 'heading', bindings: { text: 'question' } }]
    const layout: Layout = { version: 1, blocks: [repeat({ path: 'faqs', limit: 1 }, item)] }
    const bound = resolveBindings(layout, model, blocks)
    assert.deepEqual(bound.blocks[0].props?.[LIST_ITEMS_PROP], [model.doc.faqs[0]])
    assert.deepEqual(bound.blocks[0].slots?.item, item)
  })
  it('does not bind item blocks to the page document', () => {
    const layout: Layout = { version: 1, blocks: [repeat({ path: 'faqs' }, [{ id: 'n', type: 'heading', bindings: { text: 'name' } }])] }
    assert.deepEqual(resolveBindings(layout, model, blocks).blocks[0].slots?.item?.[0]?.bindings, { text: 'name' })
  })
})

const sources: Record<string, BindingField[]> = {
  models: [
    { path: '$url', label: 'Page URL', type: 'text' },
    { path: 'name', label: 'Name', type: 'text' },
    {
      path: 'faqs',
      label: 'FAQs',
      type: 'array',
      children: [
        { path: 'faqs.question', label: 'Question', type: 'text' },
        { path: 'faqs.answer', label: 'Answer', type: 'richText' },
      ],
    },
    { path: 'services', label: 'Services', type: 'relationship', relationTo: 'services', hasMany: true },
    { path: 'tags', label: 'Tags', type: 'text', hasMany: true },
  ],
  services: [
    { path: '$url', label: 'Page URL', type: 'text' },
    { path: 'title', label: 'Title', type: 'text' },
  ],
}

const paths = (fields: BindingField[] | undefined) => fields?.map((f) => f.path)

describe('repeat binding scope', () => {
  it('an array row offers its own fields, $item, $index and $parent', () => {
    assert.deepEqual(paths(itemSources(repeat({ path: 'faqs' }), sources.models, sources)), ['$item', '$index', 'question', 'answer', '$parent'])
  })
  it('$parent and $page are groups of the enclosing and page fields', () => {
    const fields = itemSources(repeat({ path: 'faqs' }), sources.models, sources, sources.models)
    const parent = fields?.find((f) => f.path === '$parent')
    assert.ok(parent?.children?.some((f) => f.path === '$parent.name'))
    assert.ok(!parent?.children?.some((f) => f.path.startsWith('$parent.$')))
    assert.ok(fields?.some((f) => f.path === '$page'))
  })
  it('a relationship row offers the related collection, with $url only when `collection` names it', () => {
    assert.deepEqual(paths(itemSources(repeat({ path: 'services' }), sources.models, sources)), ['$item', '$index', 'title', '$parent'])
    const named = itemSources(repeat({ path: 'services', collection: 'services' }), sources.models, sources)
    assert.deepEqual(paths(named), ['$item', '$index', '$url', 'title', '$parent'])
    assert.equal(named?.[0]?.hasMany, undefined)
  })
  it('an unknown path gives no scope', () => {
    assert.equal(itemSources(repeat({ path: 'nope' }), sources.models, sources), undefined)
  })
  it('scopeSources follows a repeat inside a collection list item', () => {
    const layout: Layout = {
      version: 1,
      blocks: [
        {
          id: 'l',
          type: 'collectionList',
          props: { collection: 'models' },
          slots: { item: [repeat({ path: 'faqs' }, [{ id: 'q', type: 'heading', bindings: { text: 'question' } }])] },
        },
      ],
    }
    assert.deepEqual(paths(scopeSources(layout, 'q', sources, null)), ['$item', '$index', 'question', 'answer', '$parent'])
    assert.deepEqual(scopeSources(layout, 'r', sources, null), sources.models)
    // In a template, the list item also offers $page.
    assert.ok(scopeSources(layout, 'r', sources, 'models')?.some((f) => f.path === '$page'))
  })
})

const layout = (bindings: Record<string, string>, props: Record<string, unknown> = { path: 'faqs' }): Layout => ({
  version: 1,
  blocks: [repeat(props, [{ id: 'h', type: 'heading', bindings }])],
})

describe('validateBindings in a repeat', () => {
  it('checks bindings against the row', () => {
    assert.deepEqual(validateBindings(layout({ text: 'question' }), blocks, sources, 'models'), [])
    // A one-line heading cannot show the rich text answer.
    assert.equal(validateBindings(layout({ text: 'answer' }), blocks, sources, 'models')[0]?.code, 'binding')
  })
  it('always allows $item, $index, $visible and expressions, and leaves unknown paths alone', () => {
    for (const text of ['$item', '$index', 'unknown', 'answer|question', 'Q: {{answer}}', '$parent.name']) {
      assert.deepEqual(validateBindings(layout({ text }), blocks, sources, 'models'), [], text)
    }
    assert.deepEqual(validateBindings(layout({ $visible: 'answer' }), blocks, sources, 'models'), [])
    assert.deepEqual(validateBindings(layout({ text: 'answer' }, { path: 'nope' }), blocks, sources, 'models'), [])
  })
})
