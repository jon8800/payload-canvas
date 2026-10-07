import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import { listCollectionsOf } from '../plugin/listCollections'
import {
  coerceValue,
  formatDate,
  getByPath,
  plainToRichText,
  propField,
  resolveBindings,
  richTextToPlain,
  toPlainText,
  withoutBoundRequired,
} from './bindings'
import { findBlock } from './tree'
import type { Layout, TemplateContext } from './types'
import { validateLayout } from './validate'

const blocks = defaultBlocks({ linkCollections: ['pages', 'posts'] })

const content = {
  root: {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] },
      { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Next' }] },
      { type: 'list', children: [{ type: 'listitem', children: [{ type: 'text', text: 'One' }] }] },
    ],
  },
}

const image = { id: 7, url: '/media/a.png', filename: 'a.png', mimeType: 'image/png', alt: 'A' }

const post: TemplateContext = {
  collection: 'posts',
  doc: {
    id: 3,
    title: 'Designing with blocks',
    slug: 'designing',
    excerpt: 'Small blocks.',
    views: 42,
    publishedAt: '2026-09-10T00:00:00.000Z',
    featuredImage: image,
    content,
    author: { id: 1, name: 'Ada', avatar: { ...image, id: 8 } },
    categories: [
      { id: 1, title: 'Design' },
      { id: 2, title: 'Process' },
    ],
    related: { relationTo: 'pages', value: { id: 9, title: 'About' } },
    unpopulated: 12,
    seo: { description: 'SEO text' },
    empty: null,
  },
}

describe('getByPath', () => {
  it('reads top-level and nested values', () => {
    assert.equal(getByPath(post.doc, 'title'), 'Designing with blocks')
    assert.equal(getByPath(post.doc, 'seo.description'), 'SEO text')
    assert.equal(getByPath(post.doc, 'author.avatar.url'), '/media/a.png')
  })
  it('collects values through arrays and reads numeric indexes', () => {
    assert.deepEqual(getByPath(post.doc, 'categories.title'), ['Design', 'Process'])
    assert.equal(getByPath(post.doc, 'categories.1.title'), 'Process')
  })
  it('steps into polymorphic { relationTo, value } pairs', () => {
    assert.equal(getByPath(post.doc, 'related.title'), 'About')
    assert.equal(getByPath(post.doc, 'related.relationTo'), 'pages')
  })
  it('returns undefined for missing paths and unpopulated relationships', () => {
    assert.equal(getByPath(post.doc, 'nope'), undefined)
    assert.equal(getByPath(post.doc, 'seo.nope.deeper'), undefined)
    assert.equal(getByPath(post.doc, 'unpopulated.title'), undefined)
    assert.equal(getByPath(post.doc, ''), undefined)
  })
})

describe('coercion', () => {
  it('turns rich text into plain lines', () => {
    assert.equal(richTextToPlain(content), 'Hello world\nNext\nOne')
    assert.equal(richTextToPlain(plainToRichText('a\nb')), 'a\nb')
  })
  it('formats dates, numbers, documents and lists as text', () => {
    assert.equal(formatDate('2026-09-10T00:00:00.000Z'), 'Sep 10, 2026')
    assert.equal(toPlainText('2026-09-10T00:00:00.000Z'), 'Sep 10, 2026')
    assert.equal(toPlainText(42), '42')
    assert.equal(toPlainText({ id: 1, title: 'Design' }), 'Design')
    assert.equal(toPlainText([{ title: 'A' }, { title: 'B' }]), 'A, B')
    assert.equal(toPlainText(''), undefined)
  })
  it('coerces by the prop field type', () => {
    const text = { name: 't', type: 'text' }
    assert.equal(coerceValue(content, text), 'Hello world\nNext\nOne')
    assert.equal(coerceValue(5, text), '5')
    assert.equal(coerceValue('3', { name: 'n', type: 'number' }), 3)
    assert.equal(coerceValue('x', { name: 'n', type: 'number' }), undefined)
    assert.deepEqual(coerceValue('hi', { name: 'r', type: 'richText' }), plainToRichText('hi'))
    assert.equal(coerceValue(image, { name: 'i', type: 'upload', relationTo: 'media' }), image)
    assert.equal(coerceValue(null, text), undefined)
    assert.equal(coerceValue([], text), undefined)
  })
  it('finds nested prop fields', () => {
    const button = blocks.find((b) => b.type === 'button')!
    assert.equal(propField(button.fields, 'link.url')?.type, 'text')
    assert.equal(propField(button.fields, 'link')?.type, 'group')
    assert.equal(propField(button.fields, 'nope'), undefined)
  })
})

const layout: Layout = {
  version: 1,
  blocks: [
    {
      id: 'root',
      type: 'stack',
      slots: {
        children: [
          { id: 'h', type: 'heading', props: { text: 'Literal', level: '1' }, bindings: { text: 'title' } },
          { id: 'body', type: 'text', bindings: { text: 'content' } },
          { id: 'date', type: 'text', bindings: { text: 'publishedAt' } },
          { id: 'missing', type: 'text', props: { text: 'Fallback' }, bindings: { text: 'empty' } },
          { id: 'img', type: 'image', bindings: { image: 'featuredImage' } },
          { id: 'btn', type: 'button', props: { label: 'Read', link: { type: 'reference', newTab: true } }, bindings: { 'link.url': '$url' } },
          { id: 'lnk', type: 'link', bindings: { link: '$url' } },
          { id: 'f', type: 'field', props: { path: 'author.name' } },
          {
            id: 'list',
            type: 'collectionList',
            props: { collection: 'posts' },
            slots: { item: [{ id: 'item-h', type: 'heading', bindings: { text: 'title' } }] },
          },
        ],
      },
    },
  ],
}

const url = (ctx: TemplateContext) => `/blog/${String(ctx.doc.slug)}`

describe('resolveBindings', () => {
  const resolved = resolveBindings(layout, post, blocks, { url })

  it('replaces bound props with document values and removes applied bindings', () => {
    const h = findBlock(resolved, 'h')!
    assert.deepEqual(h.props, { text: 'Designing with blocks', level: '1' })
    assert.equal(h.bindings, undefined)
    assert.equal(findBlock(resolved, 'body')?.props?.text, 'Hello world\nNext\nOne')
    assert.equal(findBlock(resolved, 'date')?.props?.text, 'Sep 10, 2026')
    assert.equal(findBlock(resolved, 'img')?.props?.image, image)
  })
  it('keeps the literal prop and the binding when the document has no value', () => {
    const missing = findBlock(resolved, 'missing')!
    assert.equal(missing.props?.text, 'Fallback')
    assert.deepEqual(missing.bindings, { text: 'empty' })
  })
  it('sets nested props and turns a bound link URL into a URL link', () => {
    assert.deepEqual(findBlock(resolved, 'btn')?.props?.link, { type: 'url', newTab: true, url: '/blog/designing' })
    assert.deepEqual(findBlock(resolved, 'lnk')?.props?.link, { type: 'url', url: '/blog/designing' })
  })
  it('leaves $url bound when there is no URL resolver', () => {
    const plain = resolveBindings(layout, post, blocks)
    assert.deepEqual(findBlock(plain, 'lnk')?.bindings, { link: '$url' })
  })
  it('gives Field blocks their value', () => {
    assert.equal(findBlock(resolved, 'f')?.props?.value, 'Ada')
  })
  it('leaves collection list items for render time', () => {
    assert.deepEqual(findBlock(resolved, 'item-h')?.bindings, { text: 'title' })
    assert.equal(findBlock(resolved, 'item-h')?.props, undefined)
  })
  it('never mutates and is safe to run twice', () => {
    assert.equal(findBlock(layout, 'h')?.props?.text, 'Literal')
    assert.deepEqual(resolveBindings(resolved, post, blocks, { url }), resolved)
  })
})

describe('validation', () => {
  it('allows empty required props when they are bound', () => {
    const errors = validateLayout(layout, blocks)
    assert.ok(errors.some((e) => e.code === 'required' && (e.blockId === 'body' || e.blockId === 'item-h')))
    const left = withoutBoundRequired(errors, layout)
    assert.ok(!left.some((e) => e.blockId === 'img' || e.blockId === 'body' || e.blockId === 'item-h'))
  })
  it('restricts the list collection to collections with a url', () => {
    const restricted = listCollectionsOf(blocks, ['posts'])
    const bad: Layout = { version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'users' } }] }
    const good: Layout = { version: 1, blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts' } }] }
    assert.ok(validateLayout(bad, restricted).some((e) => e.code === 'invalid' && e.path.endsWith('props.collection')))
    assert.deepEqual(validateLayout(good, restricted), [])
    assert.equal(listCollectionsOf(blocks, []), blocks)
  })
})
