import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import {
  bindingFromParts,
  bindingParts,
  bindingPaths,
  bindingValue,
  isVisible,
  itemSources,
  LIST_ITEMS_PROP,
  repeatRowContext,
  repeatRows,
  resolveBindings,
  resolveBlockBindings,
  scopeSources,
  validateBindings,
  visibilityFieldPaths,
} from './bindings'
import { applyOperation } from './operations'
import { normalizeLayout } from './tree'
import type { BindingField, Block, Layout, TemplateContext } from './types'
import { validateLayout } from './validate'
import { checkVisibility, type BlockVisibility, type VisibilityCondition } from './visibility'

const blocks = defaultBlocks()

const image = { id: 7, url: '/media/a.png', filename: 'a.png', mimeType: 'image/png' }
const product: TemplateContext = {
  collection: 'products',
  doc: {
    id: 1,
    name: 'Desk lamp',
    heading: '',
    summary: 'Bright and adjustable. Fits on any desk.',
    price: 1200,
    publishedAt: '2026-09-10T22:30:00.000Z',
    inStock: true,
    onSale: false,
    category: 'lighting',
    features: [{ id: 5, title: 'Dimmer' }, { id: 6, title: 'USB port' }],
    faqs: [
      { id: 'f1', question: 'Q1', answer: 'A1' },
      { id: 'f2', question: 'Q2', answer: 'A2' },
    ],
    photos: [image, { ...image, id: 8 }, { ...image, id: 9 }],
    tags: ['brass', 'compact'],
  },
}

const repeat = (props: Record<string, unknown>, item: Block[] = []): Block => ({ id: 'r', type: 'repeat', props, slots: { item } })
const ids = (props: Record<string, unknown>) =>
  repeatRows(product, { path: 'photos', ...props }).map((row) => (row as { id: number }).id)

describe('repeatRows', () => {
  it('reads array rows, hasMany documents and values', () => {
    assert.deepEqual(repeatRows(product, { path: 'faqs' }), product.doc.faqs)
    assert.deepEqual(repeatRows(product, { path: 'tags' }), ['brass', 'compact'])
    assert.deepEqual(repeatRows(product, { path: 'name' }), ['Desk lamp'])
    assert.deepEqual(repeatRows(product, { path: 'missing' }), [])
    assert.deepEqual(repeatRows(product, { path: '' }), [])
  })
  it('skips `offset` rows and keeps `limit` rows', () => {
    assert.deepEqual(ids({ offset: 1 }), [8, 9])
    assert.deepEqual(ids({ limit: 2 }), [7, 8])
    const row = repeatRowContext({ relationTo: 'features', value: { id: 5, slug: 'dimmer' } }, 0, product)
    assert.equal(row.collection, 'features')
    assert.equal(row.doc.slug, 'dimmer')
    assert.deepEqual(row.item, { id: 5, slug: 'dimmer' })
  })
})

describe('binding expressions', () => {
  it('fallback chains take the first value that is not missing', () => {
    assert.equal(bindingValue(product, 'heading|name'), 'Desk lamp')
    assert.equal(bindingValue(product, 'missing|heading'), '')
    assert.equal(bindingValue(product, 'missing|other'), undefined)
  })
  it('formatters: date, currency, number, uppercase, lowercase, truncate', () => {
    assert.equal(bindingValue(product, 'publishedAt|date:en-GB:Europe/Berlin'), '11 Sept 2026')
    assert.equal(bindingValue(product, 'publishedAt|date'), 'Sep 10, 2026')
    assert.equal(bindingValue(product, 'price|currency:EUR'), '€1,200')
    assert.equal(bindingValue({ collection: 'x', doc: { price: 99.5 } }, 'price|currency:EUR'), '€99.50')
    assert.equal(bindingValue(product, 'price|currency'), '$1,200')
    assert.equal(bindingValue(product, 'price|number'), '1,200')
    assert.equal(bindingValue(product, 'name|uppercase'), 'DESK LAMP')
    assert.equal(bindingValue(product, 'name|lowercase'), 'desk lamp')
    assert.equal(bindingValue(product, 'missing|currency:EUR'), undefined)
  })
  it('truncate cuts by characters (on a whole word) or by words', () => {
    assert.equal(bindingValue(product, 'summary|truncate:20'), 'Bright and…')
    assert.equal(bindingValue(product, 'summary|truncate:3:words'), 'Bright and adjustable.…')
    assert.equal(bindingValue(product, 'summary|truncate:500'), product.doc.summary)
    // No length: the text as it is.
    assert.equal(bindingValue(product, 'summary|truncate'), product.doc.summary)
  })
  it('after the first part, a formatter name is always a formatter', () => {
    const doc: TemplateContext = { collection: 'x', doc: { title: '', date: '2026-01-02T00:00:00.000Z', number: 5 } }
    // `date` formats the (missing) title: it is not a fallback to the `date` field.
    assert.equal(bindingValue(doc, 'title|date'), undefined)
    // As the first part it is a field.
    assert.equal(bindingValue(doc, 'date|date'), 'Jan 2, 2026')
    assert.equal(bindingValue(doc, 'number'), 5)
  })
  it('template strings put each expression in the text', () => {
    assert.equal(bindingValue(product, 'Ask about {{name}}'), 'Ask about Desk lamp')
    assert.equal(bindingValue(product, '{{name}} from {{price|currency:EUR}}'), 'Desk lamp from €1,200')
    assert.equal(bindingValue(product, '{{name}}{{missing}}'), 'Desk lamp')
    // Every expression missing: the literal prop stays.
    assert.equal(bindingValue(product, 'Photos of {{missing}}'), undefined)
  })
  it('a template string binds a prop', () => {
    const block: Block = { id: 'h', type: 'heading', props: { text: 'Ask' }, bindings: { text: 'Ask about {{name}}' } }
    assert.equal(resolveBlockBindings(block, product, blocks.find((b) => b.type === 'heading')).props?.text, 'Ask about Desk lamp')
  })
  it('lists the plain paths a binding reads', () => {
    assert.deepEqual(bindingPaths('heading|name'), ['heading', 'name'])
    assert.deepEqual(bindingPaths('Hi {{name}}, {{price|currency:EUR}} {{$item}}'), ['name', 'price'])
    assert.deepEqual(bindingPaths('$page.title|date'), ['$page.title'])
  })
  it('bindingParts reads a field, a fallback chain and one formatter; bindingFromParts writes them', () => {
    assert.deepEqual(bindingParts('price|currency:EUR:de'), { paths: ['price'], format: { name: 'currency', args: ['EUR', 'de'] } })
    assert.deepEqual(bindingParts('heading|name'), { paths: ['heading', 'name'], format: null })
    assert.equal(bindingParts('Hi {{name}}'), null)
    assert.equal(bindingParts('name|uppercase|truncate:5'), null)
    assert.equal(bindingFromParts({ paths: ['price'], format: { name: 'currency', args: ['EUR', ''] } }), 'price|currency:EUR')
    assert.equal(bindingFromParts({ paths: ['publishedAt'], format: { name: 'date', args: ['', 'Europe/Berlin'] } }), 'publishedAt|date::Europe/Berlin')
    assert.equal(bindingFromParts({ paths: ['heading', 'name'], format: null }), 'heading|name')
  })
})

const when = (...conditions: VisibilityCondition[]): BlockVisibility => ({ conditions })

describe('visibility conditions', () => {
  it('is set, is empty, equals and not equals', () => {
    assert.equal(isVisible(product, when({ field: 'inStock', operator: 'is_set' })), true)
    assert.equal(isVisible(product, when({ field: 'onSale', operator: 'is_set' })), false)
    assert.equal(isVisible(product, when({ field: 'onSale', operator: 'is_empty' })), true)
    assert.equal(isVisible(product, when({ field: 'heading', operator: 'is_empty' })), true)
    assert.equal(isVisible(product, when({ field: 'category', operator: 'equals', value: 'lighting' })), true)
    assert.equal(isVisible(product, when({ field: 'category', operator: 'equals', value: 'tables' })), false)
    assert.equal(isVisible(product, when({ field: 'category', operator: 'not_equals', value: 'tables' })), true)
    // A document's id, any item of a list, and booleans.
    assert.equal(isVisible(product, when({ field: 'features', operator: 'equals', value: 6 })), true)
    assert.equal(isVisible(product, when({ field: 'tags', operator: 'equals', value: 'brass' })), true)
    assert.equal(isVisible(product, when({ field: 'onSale', operator: 'equals', value: false })), true)
    assert.equal(isVisible(product, when({ field: 'missing', operator: 'equals', value: false })), true)
  })
  it('in, not in, like and contains', () => {
    assert.equal(isVisible(product, when({ field: 'category', operator: 'in', value: ['tables', 'lighting'] })), true)
    assert.equal(isVisible(product, when({ field: 'category', operator: 'not_in', value: ['lighting'] })), false)
    assert.equal(isVisible(product, when({ field: 'summary', operator: 'contains', value: 'ADJUSTABLE' })), true)
    assert.equal(isVisible(product, when({ field: 'summary', operator: 'like', value: 'desk bright' })), true)
    assert.equal(isVisible(product, when({ field: 'summary', operator: 'like', value: 'desk dark' })), false)
  })
  it('greater and less for numbers and dates, and the number of items with `count`', () => {
    const doc: TemplateContext = { collection: 'products', doc: { id: 1, stock: 27, price: '450', photos: [1, 2, 3], none: [], name: 'Lamp', date: '2026-05-01T00:00:00.000Z' } }
    assert.equal(isVisible(doc, when({ field: 'stock', operator: 'greater_than', value: 25 })), true)
    assert.equal(isVisible(doc, when({ field: 'stock', operator: 'greater_than_equal', value: 27 })), true)
    assert.equal(isVisible(doc, when({ field: 'stock', operator: 'less_than', value: 27 })), false)
    assert.equal(isVisible(doc, when({ field: 'stock', operator: 'less_than_equal', value: '27' })), true)
    assert.equal(isVisible(doc, when({ field: 'price', operator: 'greater_than', value: 400 })), true)
    assert.equal(isVisible(doc, when({ field: 'name', operator: 'greater_than', value: 3 })), false)
    assert.equal(isVisible(doc, when({ field: 'missing', operator: 'less_than', value: 5 })), false)
    assert.equal(isVisible(doc, when({ field: 'date', operator: 'greater_than', value: '2026-01-01' })), true)
    assert.equal(isVisible(doc, when({ field: 'photos', operator: 'greater_than_equal', value: 3, count: true })), true)
    assert.equal(isVisible(doc, when({ field: 'photos', operator: 'greater_than', value: 3, count: true })), false)
    assert.equal(isVisible(doc, when({ field: 'none', operator: 'equals', value: 0, count: true })), true)
    assert.equal(isVisible(doc, when({ field: 'none', operator: 'is_set', count: true })), false)
    assert.equal(isVisible(doc, when({ field: 'name', operator: 'equals', value: 1, count: true })), true)
  })
  it('all conditions by default, any with match "any"; none: visible', () => {
    const conditions: VisibilityCondition[] = [
      { field: 'inStock', operator: 'is_set' },
      { field: 'onSale', operator: 'is_set' },
    ]
    assert.equal(isVisible(product, { conditions }), false)
    assert.equal(isVisible(product, { match: 'any', conditions }), true)
    assert.equal(isVisible(product, { conditions: [] }), true)
    assert.equal(isVisible(product, undefined), true)
    // $index and $page work like in bindings.
    const item: TemplateContext = { collection: 'products', doc: {}, index: 2, page: { title: 'Shop' } }
    assert.equal(isVisible(item, when({ field: '$index', operator: 'greater_than', value: 1 }, { field: '$page.title', operator: 'equals', value: 'Shop' })), true)
    assert.deepEqual(visibilityFieldPaths(when({ field: '$index', operator: 'is_set' }, { field: 'photos', operator: 'is_set', count: true })), ['photos'])
  })
  it('hides the block when the conditions fail', () => {
    const block: Block = { id: 'b', type: 'text', props: { text: 'Sale' }, visibility: when({ field: 'onSale', operator: 'equals', value: true }) }
    assert.equal(resolveBlockBindings(block, product, undefined).hidden, true)
    const shown = resolveBlockBindings({ ...block, visibility: when({ field: 'inStock', operator: 'is_set' }) }, product, undefined)
    assert.equal(shown.hidden, undefined)
  })
  it('checkVisibility returns the canonical form or an error', () => {
    assert.deepEqual(checkVisibility({ match: 'all', conditions: [{ field: ' price ', operator: 'is_set', value: 3 }] }), { conditions: [{ field: 'price', operator: 'is_set' }] })
    assert.deepEqual(checkVisibility({ match: 'any', conditions: [{ field: 'tags', operator: 'in', value: 'brass' }] }), {
      match: 'any',
      conditions: [{ field: 'tags', operator: 'in', value: ['brass'] }],
    })
    assert.equal(checkVisibility({ conditions: [] }), undefined)
    assert.match(String(checkVisibility({ conditions: [{ field: 'a', operator: 'between' }] })), /operator/)
    assert.match(String(checkVisibility({ conditions: [{ field: '', operator: 'is_set' }] })), /field/)
    assert.match(String(checkVisibility({ conditions: [{ field: 'a', operator: 'equals', value: { x: 1 } }] })), /value/)
  })
  it('is stored in canonical form, updated with an exact undo, and validated', () => {
    const layout = normalizeLayout({
      version: 1,
      blocks: [
        { id: 'a', type: 'text', visibility: { conditions: [{ field: 'x', operator: 'nope' }, { field: 'stock', operator: 'greater_than', value: 0 }] } },
        { id: 'b', type: 'text', visibility: { conditions: [] } },
      ],
    })
    assert.deepEqual(layout.blocks[0]?.visibility, { conditions: [{ field: 'stock', operator: 'greater_than', value: 0 }] })
    assert.equal('visibility' in (layout.blocks[1] ?? {}), false)
    const applied = applyOperation(layout, { type: 'update', id: 'b', visibility: when({ field: 'inStock', operator: 'is_set' }) })
    assert.ok(applied.ok)
    if (!applied.ok) return
    assert.deepEqual(applied.layout.blocks[1]?.visibility, when({ field: 'inStock', operator: 'is_set' }))
    const undone = applyOperation(applied.layout, applied.inverse[0]!)
    assert.ok(undone.ok)
    if (undone.ok) assert.deepEqual(undone.layout, layout)
    assert.equal(applyOperation(layout, { type: 'update', id: 'b', visibility: { conditions: [{ field: '', operator: 'is_set' }] } }).ok, false)
    const errors = validateLayout({ version: 1, blocks: [{ id: 'c', type: 'text', props: { text: 'x' }, visibility: { conditions: 'x' } }] }, blocks)
    assert.ok(errors.some((e) => e.path === 'blocks[0].visibility'))
  })
})

describe('resolveBindings with a repeat', () => {
  it('attaches the rows and leaves the item design for render time', () => {
    const item: Block[] = [{ id: 'q', type: 'heading', bindings: { text: 'question' } }]
    const layout: Layout = { version: 1, blocks: [repeat({ path: 'faqs', limit: 1 }, item)] }
    const bound = resolveBindings(layout, product, blocks)
    assert.deepEqual(bound.blocks[0].props?.[LIST_ITEMS_PROP], [product.doc.faqs[0]])
    assert.deepEqual(bound.blocks[0].slots?.item, item)
  })
  it('does not bind item blocks to the page document', () => {
    const layout: Layout = { version: 1, blocks: [repeat({ path: 'faqs' }, [{ id: 'n', type: 'heading', bindings: { text: 'name' } }])] }
    assert.deepEqual(resolveBindings(layout, product, blocks).blocks[0].slots?.item?.[0]?.bindings, { text: 'name' })
  })
})

const sources: Record<string, BindingField[]> = {
  products: [
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
    { path: 'features', label: 'Features', type: 'relationship', relationTo: 'features', hasMany: true },
    { path: 'tags', label: 'Tags', type: 'text', hasMany: true },
  ],
  features: [
    { path: '$url', label: 'Page URL', type: 'text' },
    { path: 'title', label: 'Title', type: 'text' },
  ],
}

const paths = (fields: BindingField[] | undefined) => fields?.map((f) => f.path)

describe('repeat binding scope', () => {
  it('an array row offers its own fields, $item, $index and $parent', () => {
    assert.deepEqual(paths(itemSources(repeat({ path: 'faqs' }), sources.products, sources)), ['$item', '$index', 'question', 'answer', '$parent'])
  })
  it('$parent and $page are groups of the enclosing and page fields', () => {
    const fields = itemSources(repeat({ path: 'faqs' }), sources.products, sources, sources.products)
    const parent = fields?.find((f) => f.path === '$parent')
    assert.ok(parent?.children?.some((f) => f.path === '$parent.name'))
    assert.ok(!parent?.children?.some((f) => f.path.startsWith('$parent.$')))
    assert.ok(fields?.some((f) => f.path === '$page'))
  })
  it('a relationship row offers the related collection, with $url only when `collection` names it', () => {
    assert.deepEqual(paths(itemSources(repeat({ path: 'features' }), sources.products, sources)), ['$item', '$index', 'title', '$parent'])
    const named = itemSources(repeat({ path: 'features', collection: 'features' }), sources.products, sources)
    assert.deepEqual(paths(named), ['$item', '$index', '$url', 'title', '$parent'])
    assert.equal(named?.[0]?.hasMany, undefined)
  })
  it('an unknown path gives no scope', () => {
    assert.equal(itemSources(repeat({ path: 'nope' }), sources.products, sources), undefined)
  })
  it('scopeSources follows a repeat inside a collection list item', () => {
    const layout: Layout = {
      version: 1,
      blocks: [
        {
          id: 'l',
          type: 'collectionList',
          props: { collection: 'products' },
          slots: { item: [repeat({ path: 'faqs' }, [{ id: 'q', type: 'heading', bindings: { text: 'question' } }])] },
        },
      ],
    }
    assert.deepEqual(paths(scopeSources(layout, 'q', sources, null)), ['$item', '$index', 'question', 'answer', '$parent'])
    assert.deepEqual(scopeSources(layout, 'r', sources, null), sources.products)
    // In a template, the list item also offers $page.
    assert.ok(scopeSources(layout, 'r', sources, 'products')?.some((f) => f.path === '$page'))
  })
  it('scopeSources offers $page at the top level of a template too', () => {
    const layout: Layout = { version: 1, blocks: [{ id: 'h', type: 'heading', bindings: { text: '$page.name' } }] }
    const fields = scopeSources(layout, 'h', sources, 'products')
    assert.ok(fields?.find((f) => f.path === '$page')?.children?.some((f) => f.path === '$page.name'))
  })
})

const layout = (bindings: Record<string, string>, props: Record<string, unknown> = { path: 'faqs' }): Layout => ({
  version: 1,
  blocks: [repeat(props, [{ id: 'h', type: 'heading', bindings }])],
})

describe('validateBindings in a repeat', () => {
  it('checks bindings against the row', () => {
    assert.deepEqual(validateBindings(layout({ text: 'question' }), blocks, sources, 'products'), [])
    // A one-line heading cannot show the rich text answer.
    assert.equal(validateBindings(layout({ text: 'answer' }), blocks, sources, 'products')[0]?.code, 'binding')
  })
  it('always allows $item, $index and expressions, and leaves unknown paths alone', () => {
    for (const text of ['$item', '$index', 'unknown', 'answer|question', 'Q: {{answer}}', '$parent.name']) {
      assert.deepEqual(validateBindings(layout({ text }), blocks, sources, 'products'), [], text)
    }
    assert.deepEqual(validateBindings(layout({ text: 'answer' }, { path: 'nope' }), blocks, sources, 'products'), [])
  })
})
