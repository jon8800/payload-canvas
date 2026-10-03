import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BindingField, Layout } from '../../../core/types'
import {
  bindingTrail,
  findBindingField,
  hasBindableField,
  isCompatible,
  listAncestor,
  pickerRows,
  previewValue,
  propKind,
  propPathOf,
  URL_FIELD,
  valueAt,
} from './binding'

const fields: BindingField[] = [
  { path: 'title', label: 'Title', type: 'text' },
  { path: 'content', label: 'Content', type: 'richText' },
  { path: 'featuredImage', label: 'Featured image', type: 'upload', relationTo: 'media' },
  { path: 'publishedAt', label: 'Published', type: 'date' },
  {
    path: 'author',
    label: 'Author',
    type: 'relationship',
    relationTo: 'users',
    children: [
      { path: 'author.name', label: 'Name', type: 'text' },
      { path: 'author.avatar', label: 'Avatar', type: 'upload', relationTo: 'media' },
    ],
  },
  { path: 'seo', label: 'SEO', type: 'group', children: [{ path: 'seo.description', label: 'Description', type: 'textarea' }] },
  { path: 'tags', label: 'Tags', type: 'relationship', relationTo: 'tags', hasMany: true, children: [{ path: 'tags.name', label: 'Name', type: 'text' }] },
  { path: 'items', label: 'Items', type: 'array', children: [{ path: 'items.text', label: 'Text', type: 'text' }] },
]

test('propKind maps prop field types and skips hasMany', () => {
  assert.equal(propKind({ type: 'text' }), 'text')
  assert.equal(propKind({ type: 'textarea' }), 'text')
  assert.equal(propKind({ type: 'richText' }), 'richText')
  assert.equal(propKind({ type: 'upload' }), 'upload')
  assert.equal(propKind({ type: 'select' }), null)
  assert.equal(propKind({ type: 'upload', hasMany: true }), null)
})

const by = (path: string) => findBindingField([URL_FIELD, ...fields], path)!

test('compatibility follows the binding rules', () => {
  assert.ok(isCompatible('text', by('title')))
  assert.ok(isCompatible('text', by('content')), 'rich text shows as plain text')
  assert.ok(isCompatible('text', by('$url')))
  assert.ok(!isCompatible('text', by('featuredImage')))
  assert.ok(isCompatible('richText', by('content')))
  assert.ok(!isCompatible('richText', by('title')))
  assert.ok(isCompatible('upload', by('featuredImage'), { type: 'upload', relationTo: 'media' }))
  assert.ok(!isCompatible('upload', by('featuredImage'), { type: 'upload', relationTo: 'documents' }))
  assert.ok(!isCompatible('text', by('tags')), 'hasMany relationships do not bind to one value')
  assert.ok(isCompatible('any', by('tags')))
  assert.ok(isCompatible('link', by('$url')))
  assert.ok(isCompatible('link', by('title')))
  assert.ok(!isCompatible('link', by('content')))
})

test('a link group binds as a whole', () => {
  assert.equal(propKind({ type: 'group', admin: { custom: { builderLink: true } } }), 'link')
  assert.equal(propKind({ type: 'group' }), null)
})

test('pickerRows keeps containers with matching children and walks one relationship hop', () => {
  const rows = pickerRows(fields, (f) => isCompatible('text', f))
  const paths = rows.map((r) => `${r.selectable ? '' : '#'}${r.field.path}`)
  assert.deepEqual(paths, ['title', 'content', 'publishedAt', '#author', 'author.name', '#seo', 'seo.description'])
  assert.equal(rows.find((r) => r.field.path === 'author.name')?.depth, 1)
})

test('pickerRows filters by label, trail or path', () => {
  const rows = pickerRows(fields, (f) => isCompatible('text', f), 'author name')
  assert.deepEqual(
    rows.map((r) => r.field.path),
    ['author', 'author.name'],
  )
  assert.deepEqual(
    pickerRows(fields, () => true, 'seo.desc').map((r) => r.field.path),
    ['seo', 'seo.description'],
  )
})

test('findBindingField and bindingTrail resolve nested paths', () => {
  assert.equal(findBindingField(fields, 'author.avatar')?.label, 'Avatar')
  assert.equal(findBindingField(fields, 'nope'), null)
  assert.deepEqual(bindingTrail(fields, 'author.name'), ['Author', 'Name'])
  assert.deepEqual(bindingTrail(fields, 'x.y'), ['x', 'y'])
})

test('valueAt walks groups and populated (also polymorphic) relationships', () => {
  const doc = {
    title: 'Hello',
    seo: { description: 'Desc' },
    author: { id: 1, name: 'Ann' },
    ref: { relationTo: 'users', value: { id: 2, name: 'Bob' } },
  }
  assert.equal(valueAt(doc, 'title'), 'Hello')
  assert.equal(valueAt(doc, 'seo.description'), 'Desc')
  assert.equal(valueAt(doc, 'author.name'), 'Ann')
  assert.equal(valueAt(doc, 'ref.name'), 'Bob')
  assert.equal(valueAt(doc, 'missing.name'), undefined)
  assert.equal(valueAt(null, 'title'), undefined)
})

test('previewValue renders text, rich text, uploads and empties', () => {
  const lexical = {
    root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'One' }] }, { type: 'paragraph', children: [{ type: 'text', text: 'Two' }] }] },
  }
  assert.deepEqual(previewValue(lexical, 'richText'), { kind: 'text', text: 'One Two' })
  assert.deepEqual(previewValue('', 'text'), { kind: 'empty' })
  assert.deepEqual(previewValue({ id: 1, url: '/a.jpg', alt: 'A', sizes: { thumbnail: { url: '/a-thumb.jpg' } } }, 'upload'), {
    kind: 'image',
    url: '/a-thumb.jpg',
    alt: 'A',
  })
  assert.deepEqual(previewValue({ id: 3, name: 'Ann' }, 'relationship'), { kind: 'text', text: 'Ann' })
})

test('listAncestor finds the nearest list whose item slot holds the block', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      {
        id: 'list',
        type: 'collectionList',
        props: { collection: 'posts' },
        slots: { item: [{ id: 'card', type: 'stack', slots: { children: [{ id: 'h', type: 'heading' }] } }] },
      },
      { id: 'out', type: 'heading' },
    ],
  }
  assert.equal(listAncestor(layout, 'h')?.id, 'list')
  assert.equal(listAncestor(layout, 'card')?.id, 'list')
  assert.equal(listAncestor(layout, 'list'), null)
  assert.equal(listAncestor(layout, 'out'), null)
})

test('propPathOf strips the inspector prefix and skips array rows', () => {
  assert.equal(propPathOf('builder.b1.', 'builder.b1.link.url'), 'link.url')
  assert.equal(propPathOf('builder.b1.', 'builder.b1.items.0.text'), null)
  assert.equal(propPathOf('builder.b1.', 'other.text'), null)
})

test('hasBindableField looks into groups but not arrays', () => {
  assert.ok(hasBindableField([{ type: 'group', name: 'link', fields: [{ type: 'text', name: 'url' }] }]))
  assert.ok(!hasBindableField([{ type: 'array', name: 'items', fields: [{ type: 'text', name: 'text' }] }]))
  assert.ok(!hasBindableField([{ type: 'select', name: 'as' }]))
})
