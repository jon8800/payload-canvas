import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import { linkField } from '../blocks/link'
import { collectReferences, readReferences, referenceTargets, sameReferences } from './references'
import type { BlockDefinition, Layout } from './types'

const custom: BlockDefinition[] = [
  {
    type: 'card',
    label: 'Card',
    fields: [
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'gallery', type: 'upload', relationTo: 'media', hasMany: true },
      { name: 'related', type: 'relationship', relationTo: ['pages', 'posts'], hasMany: true },
      linkField({ collections: ['pages', 'posts'] }),
      { type: 'row', fields: [{ name: 'form', type: 'relationship', relationTo: 'forms' }] },
      { name: 'meta', type: 'group', fields: [{ name: 'icon', type: 'upload', relationTo: 'icons' }] },
      { name: 'items', type: 'array', fields: [{ name: 'photo', type: 'upload', relationTo: 'media' }] },
      {
        name: 'parts',
        type: 'blocks',
        blocks: [{ slug: 'quote', fields: [{ name: 'author', type: 'relationship', relationTo: 'people' }] }],
      },
      { type: 'tabs', tabs: [{ name: 'seo', fields: [{ name: 'og', type: 'upload', relationTo: 'media' }] }] },
      { name: 'body', type: 'richText' },
    ],
  },
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
]

const lexical = (children: unknown[]) => ({ root: { type: 'root', children: [{ type: 'paragraph', children }] } })

describe('collectReferences', () => {
  it('finds every kind of reference, in nested slots, without duplicates', () => {
    const layout: Layout = {
      version: 1,
      blocks: [
        {
          id: 's',
          type: 'stack',
          slots: {
            children: [
              {
                id: 'c',
                type: 'card',
                hidden: true,
                props: {
                  image: 1,
                  gallery: [1, '2', { id: 3, filename: 'x.png' }],
                  related: [{ relationTo: 'posts', value: 7 }, { relationTo: 'nope', value: 1 }],
                  link: { type: 'reference', reference: { relationTo: 'pages', value: 4 } },
                  form: 9,
                  meta: { icon: 'i1' },
                  items: [{ photo: 5 }, { photo: null }],
                  parts: [{ blockType: 'quote', author: 11 }, { blockType: 'unknown', author: 12 }],
                  seo: { og: 6 },
                  body: lexical([
                    { type: 'upload', relationTo: 'media', value: 8 },
                    { type: 'link', fields: { linkType: 'internal', doc: { relationTo: 'pages', value: { id: 4 } } }, children: [] },
                    { type: 'link', fields: { linkType: 'custom', url: '/x', doc: { relationTo: 'pages', value: 99 } }, children: [] },
                  ]),
                },
              },
            ],
          },
        },
        { id: 'c2', type: 'card', props: { image: '1', unknownProp: 5 } },
        { id: 'u', type: 'unknown-type', props: { image: 50 } },
      ],
    }
    assert.deepEqual(collectReferences(layout, custom), [
      { relationTo: 'media', value: 1 },
      { relationTo: 'media', value: '2' },
      { relationTo: 'media', value: 3 },
      { relationTo: 'posts', value: 7 },
      { relationTo: 'pages', value: 4 },
      { relationTo: 'forms', value: 9 },
      { relationTo: 'icons', value: 'i1' },
      { relationTo: 'media', value: 5 },
      { relationTo: 'people', value: 11 },
      { relationTo: 'media', value: 6 },
      { relationTo: 'media', value: 8 },
    ])
  })

  it('ignores the stored document of a URL link and bound props without a value', () => {
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: 'a', type: 'card', props: { link: { type: 'url', url: '/x', reference: { relationTo: 'pages', value: 4 } } } },
        { id: 'b', type: 'card', props: { link: { url: '/y', reference: { relationTo: 'pages', value: 5 } } } },
        { id: 'c', type: 'card', props: { link: { reference: { relationTo: 'pages', value: 6 } } } },
        { id: 'd', type: 'card', bindings: { image: 'featuredImage' } },
        { id: 'e', type: 'card', bindings: { image: 'featuredImage' }, props: { image: 2 } },
      ],
    }
    assert.deepEqual(collectReferences(layout, custom), [
      { relationTo: 'pages', value: 6 },
      { relationTo: 'media', value: 2 },
    ])
  })

  it('works with the default blocks', () => {
    const blocks = defaultBlocks({ mediaCollection: 'media', linkCollections: ['pages'] })
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: 'i', type: 'image', props: { image: 3 } },
        { id: 'b', type: 'button', props: { link: { type: 'reference', reference: { relationTo: 'pages', value: 1 } } } },
      ],
    }
    assert.deepEqual(collectReferences(layout, blocks), [
      { relationTo: 'media', value: 3 },
      { relationTo: 'pages', value: 1 },
    ])
  })
})

describe('referenceTargets', () => {
  it('lists every collection the fields point at and notes rich text', () => {
    assert.deepEqual(referenceTargets(custom), {
      collections: ['media', 'pages', 'posts', 'forms', 'icons', 'people'],
      richText: true,
    })
    assert.deepEqual(referenceTargets([custom[1]]), { collections: [], richText: false })
  })
})

describe('readReferences and sameReferences', () => {
  it('reads stored values, populated or not, and compares by key', () => {
    const stored = readReferences([{ relationTo: 'media', value: { id: 1 } }, { relationTo: 'pages', value: 2 }, 'x', { value: 3 }])
    assert.deepEqual(stored, [{ relationTo: 'media', value: 1 }, { relationTo: 'pages', value: 2 }])
    assert.equal(sameReferences(stored, [{ relationTo: 'media', value: '1' }, { relationTo: 'pages', value: 2 }]), true)
    assert.equal(sameReferences(stored, [{ relationTo: 'pages', value: 2 }, { relationTo: 'media', value: 1 }]), false)
    assert.deepEqual(readReferences(null), [])
  })
})
