import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { fieldAtPropPath } from '../../../core'
import type { Block, BlockDefinition } from '../../../core/types'
import { altFromFileName, altPropPath, mediaRef, propAt, removeOp, uploadFieldAt, uploadValue } from './model'

const definition: BlockDefinition = {
  type: 'card',
  label: 'Card',
  fields: [
    { name: 'photo', type: 'upload', relationTo: 'media', required: true },
    { name: 'photoAlt', type: 'text' },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'alt', type: 'text' },
    { name: 'items', type: 'array', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }, { name: 'label', type: 'text' }] },
    { name: 'gallery', type: 'upload', relationTo: 'media', hasMany: true },
    { name: 'either', type: 'upload', relationTo: ['media', 'images'] },
    { type: 'row', fields: [{ name: 'cover', type: 'upload', relationTo: 'media' }] },
    { name: 'tags', type: 'text', hasMany: true },
  ],
}

describe('fieldAtPropPath', () => {
  test('follows groups, array rows and hasMany values', () => {
    assert.equal(fieldAtPropPath(definition.fields, 'items.2.image')?.type, 'upload')
    assert.equal(fieldAtPropPath(definition.fields, 'items.2.label')?.type, 'text')
    assert.equal(fieldAtPropPath(definition.fields, 'items')?.type, 'array')
    assert.equal(fieldAtPropPath(definition.fields, 'cover')?.type, 'upload')
    assert.equal(fieldAtPropPath(definition.fields, 'tags.1')?.name, 'tags')
    assert.equal(fieldAtPropPath(definition.fields, 'gallery.0')?.name, 'gallery')
  })

  test('refuses paths that do not follow the fields', () => {
    assert.equal(fieldAtPropPath(definition.fields, 'items.image'), undefined)
    assert.equal(fieldAtPropPath(definition.fields, 'items.x.image'), undefined)
    assert.equal(fieldAtPropPath(definition.fields, 'photo.0'), undefined)
    assert.equal(fieldAtPropPath(definition.fields, 'tags.1.x'), undefined)
    assert.equal(fieldAtPropPath(definition.fields, 'nope'), undefined)
  })
})

describe('uploadFieldAt', () => {
  test('single, row, hasMany item and polymorphic uploads', () => {
    assert.deepEqual(uploadFieldAt(definition, 'photo')?.collections, ['media'])
    assert.equal(uploadFieldAt(definition, 'photo')?.required, true)
    assert.equal(uploadFieldAt(definition, 'items.1.image')?.item, false)
    assert.equal(uploadFieldAt(definition, 'gallery.1')?.item, true)
    assert.equal(uploadFieldAt(definition, 'gallery'), null)
    assert.equal(uploadFieldAt(definition, 'either')?.polymorphic, true)
    assert.equal(uploadFieldAt(definition, 'alt'), null)
    assert.equal(uploadFieldAt(undefined, 'photo'), null)
  })

  test('values and references for plain and polymorphic fields', () => {
    const plain = uploadFieldAt(definition, 'photo')!
    const poly = uploadFieldAt(definition, 'either')!
    assert.equal(uploadValue(plain, 'media', 5), 5)
    assert.deepEqual(uploadValue(poly, 'images', 5), { relationTo: 'images', value: 5 })
    assert.deepEqual(mediaRef(plain, 5), { collection: 'media', id: 5 })
    assert.deepEqual(mediaRef(plain, { id: 'a', url: '/x.jpg' }), { collection: 'media', id: 'a' })
    assert.deepEqual(mediaRef(poly, { relationTo: 'images', value: 9 }), { collection: 'images', id: 9 })
    assert.equal(mediaRef(plain, null), null)
  })
})

describe('removeOp', () => {
  const block: Block = { id: 'b', type: 'card', props: { image: 3, items: [{ image: 1 }, { image: 2 }], gallery: [1, 2, 3] } }

  test('a single upload becomes null, a row field too', () => {
    assert.deepEqual(removeOp(block, 'image', uploadFieldAt(definition, 'image')!), { type: 'update', id: 'b', props: { image: null } })
    assert.deepEqual(removeOp(block, 'items.1.image', uploadFieldAt(definition, 'items.1.image')!), {
      type: 'update',
      id: 'b',
      props: { items: [{ image: 1 }, { image: null }] },
    })
  })

  test('one value of a hasMany upload leaves the list', () => {
    assert.deepEqual(removeOp(block, 'gallery.1', uploadFieldAt(definition, 'gallery.1')!), { type: 'update', id: 'b', props: { gallery: [1, 3] } })
    assert.equal(removeOp(block, 'gallery.9', uploadFieldAt(definition, 'gallery.9')!), null)
  })
})

test('altPropPath finds alt, altText and <name>Alt next to the upload', () => {
  assert.equal(altPropPath(definition, 'image'), 'alt')
  assert.equal(altPropPath(definition, 'photo'), 'photoAlt')
  assert.equal(altPropPath(definition, 'items.0.image'), null)
  assert.equal(altPropPath(definition, 'gallery.1'), null)
})

test('propAt reads rows and hasMany values', () => {
  assert.equal(propAt({ items: [{ image: 1 }, { image: 2 }] }, 'items.1.image'), 2)
  assert.equal(propAt({ gallery: [4, 5] }, 'gallery.1'), 5)
  assert.equal(propAt(undefined, 'x'), undefined)
})

test('altFromFileName makes a sentence from a file name', () => {
  assert.equal(altFromFileName('sunset_over-the-bay.JPG'), 'Sunset over the bay')
  assert.equal(altFromFileName('.png'), '')
})
