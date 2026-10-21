import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import {
  fieldListRowContext,
  fieldListRows,
  itemSources,
  LIST_ITEMS_PROP,
  resolveBindings,
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
    faqs: [
      { id: 'f1', question: 'Q1', answer: 'A1' },
      { id: 'f2', question: 'Q2', answer: 'A2' },
    ],
    galleryImages: [image, { ...image, id: 8 }, { ...image, id: 9 }],
    tags: ['tall', 'blonde'],
  },
}

const fieldList = (props: Record<string, unknown>, item: Block[] = []): Block => ({
  id: 'fl',
  type: 'fieldList',
  props,
  slots: { item },
})

const ids = (props: Record<string, unknown>) => fieldListRows(model.doc, { path: 'galleryImages', ...props }).map((row) => (row as { id: number }).id)

describe('fieldListRows', () => {
  it('reads array rows, hasMany documents and values', () => {
    assert.deepEqual(fieldListRows(model.doc, { path: 'faqs' }), model.doc.faqs)
    assert.deepEqual(fieldListRows(model.doc, { path: 'tags' }), ['tall', 'blonde'])
    assert.deepEqual(fieldListRows(model.doc, { path: 'name' }), ['Ada'])
    assert.deepEqual(fieldListRows(model.doc, { path: 'missing' }), [])
    assert.deepEqual(fieldListRows(model.doc, { path: '' }), [])
  })
  it('skips `offset` rows and keeps `limit` rows', () => {
    assert.deepEqual(ids({ offset: 1 }), [8, 9])
    assert.deepEqual(ids({ limit: 2 }), [7, 8])
    assert.deepEqual(ids({ offset: 1, limit: 1 }), [8])
    assert.deepEqual(ids({ offset: -1, limit: 0 }), [7, 8, 9])
  })
})

describe('fieldListRowContext', () => {
  it('gives the row fields, $item and $index (from 1)', () => {
    const row = fieldListRowContext({ id: 'f1', question: 'Q1' }, 0, 'services')
    assert.deepEqual(row, { collection: 'services', doc: { id: 'f1', question: 'Q1', $item: { id: 'f1', question: 'Q1' }, $index: 1 } })
    assert.deepEqual(fieldListRowContext('tall', 1).doc, { $item: 'tall', $index: 2 })
  })
  it('opens a { relationTo, value } row on its own collection', () => {
    const row = fieldListRowContext({ relationTo: 'services', value: { id: 5, slug: 'dinner' } }, 0)
    assert.equal(row.collection, 'services')
    assert.equal(row.doc.slug, 'dinner')
    assert.deepEqual(row.doc.$item, { id: 5, slug: 'dinner' })
  })
})

describe('resolveBindings with a field list', () => {
  it('attaches the rows and leaves the item design for render time', () => {
    const item: Block[] = [{ id: 'q', type: 'heading', bindings: { text: 'question' } }]
    const layout: Layout = { version: 1, blocks: [fieldList({ path: 'faqs', limit: 1 }, item)] }
    const bound = resolveBindings(layout, model, blocks)
    assert.deepEqual(bound.blocks[0].props?.[LIST_ITEMS_PROP], [model.doc.faqs[0]])
    assert.deepEqual(bound.blocks[0].slots?.item, item)
  })
  it('does not bind item blocks to the page document', () => {
    const layout: Layout = { version: 1, blocks: [fieldList({ path: 'faqs' }, [{ id: 'n', type: 'heading', bindings: { text: 'name' } }])] }
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

describe('field list binding scope', () => {
  it('an array row offers its own fields, $item and $index', () => {
    const fields = itemSources(fieldList({ path: 'faqs' }), sources.models, sources)
    assert.deepEqual(fields?.map((f) => f.path), ['$item', '$index', 'question', 'answer'])
  })
  it('a relationship row offers the related collection, with $url only when `collection` names it', () => {
    assert.deepEqual(itemSources(fieldList({ path: 'services' }), sources.models, sources)?.map((f) => f.path), ['$item', '$index', 'title'])
    const named = itemSources(fieldList({ path: 'services', collection: 'services' }), sources.models, sources)
    assert.deepEqual(named?.map((f) => f.path), ['$item', '$index', '$url', 'title'])
    assert.equal(named?.[0]?.hasMany, undefined)
  })
  it('an unknown path gives no scope', () => {
    assert.equal(itemSources(fieldList({ path: 'nope' }), sources.models, sources), undefined)
  })
  it('scopeSources follows a field list inside a collection list item', () => {
    const layout: Layout = {
      version: 1,
      blocks: [
        {
          id: 'l',
          type: 'collectionList',
          props: { collection: 'models' },
          slots: { item: [fieldList({ path: 'faqs' }, [{ id: 'q', type: 'heading', bindings: { text: 'question' } }])] },
        },
      ],
    }
    assert.deepEqual(scopeSources(layout, 'q', sources, null)?.map((f) => f.path), ['$item', '$index', 'question', 'answer'])
    assert.deepEqual(scopeSources(layout, 'fl', sources, null), sources.models)
  })
})

const layout = (bindings: Record<string, string>, props: Record<string, unknown> = { path: 'faqs' }): Layout => ({
  version: 1,
  blocks: [fieldList(props, [{ id: 'h', type: 'heading', bindings }])],
})

describe('validateBindings in a field list', () => {
  it('checks bindings against the row', () => {
    assert.deepEqual(validateBindings(layout({ text: 'question' }), blocks, sources, 'models'), [])
    // A one-line heading cannot show the rich text answer.
    assert.equal(validateBindings(layout({ text: 'answer' }), blocks, sources, 'models')[0]?.code, 'binding')
  })
  it('always allows $item and $index, and leaves unknown paths alone', () => {
    assert.deepEqual(validateBindings(layout({ text: '$item' }), blocks, sources, 'models'), [])
    assert.deepEqual(validateBindings(layout({ text: '$index' }), blocks, sources, 'models'), [])
    assert.deepEqual(validateBindings(layout({ text: 'unknown' }), blocks, sources, 'models'), [])
    assert.deepEqual(validateBindings(layout({ text: 'answer' }, { path: 'nope' }), blocks, sources, 'models'), [])
  })
})
