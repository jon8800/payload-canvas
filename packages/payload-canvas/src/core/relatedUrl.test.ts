import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { defaultBlocks } from '../blocks'
import { attachListItems, RenderLayout, type ResolveLink } from '../react'
import { bindingPaths, bindingRelations, bindingValue, type BindingOptions } from './bindings'
import type { Layout, TemplateContext } from './types'

const relations = bindingRelations([
  {
    slug: 'models',
    fields: [
      { name: 'name', type: 'text' },
      { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
      { name: 'agency', type: 'relationship', relationTo: ['agencies', 'pages'] },
      { name: 'gallery', type: 'array', fields: [{ name: 'photo', type: 'upload', relationTo: 'media' }] },
      { type: 'row', fields: [{ name: 'home', type: 'relationship', relationTo: 'locations' }] },
    ],
  },
  { slug: 'locations', fields: [{ name: 'region', type: 'relationship', relationTo: 'regions' }] },
  { slug: 'plain', fields: [{ name: 'title', type: 'text' }] },
])
const url: BindingOptions['url'] = (context) => `/${context.collection}/${String(context.doc.slug)}`
const model: TemplateContext = {
  collection: 'models',
  doc: {
    id: 1,
    slug: 'ada',
    categories: [{ id: 3, slug: 'vip' }, 4],
    agency: { relationTo: 'agencies', value: { id: 9, slug: 'luxe' } },
    home: { id: 2, slug: 'north', region: { id: 5, slug: 'qld' } },
  },
}

const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url ?? null
  const doc = link.reference?.value as { slug?: string } | undefined
  return doc?.slug ? `/${link.reference?.relationTo}/${doc.slug}` : null
}

describe('$url of related documents', () => {
  it('bindingRelations maps each relationship path to its collection', () => {
    assert.deepEqual(relations, {
      models: { categories: 'categories', 'gallery.photo': 'media', home: 'locations' },
      locations: { region: 'regions' },
    })
  })
  it('<path>.$url links to the related document, through rows and several hops', () => {
    const options = { url, relations }
    assert.equal(bindingValue(model, 'categories.0.$url', options), '/categories/vip')
    assert.equal(bindingValue(model, 'home.region.$url', options), '/regions/qld')
    // A { relationTo, value } pair names its own collection.
    assert.equal(bindingValue(model, 'agency.$url', { url }), '/agencies/luxe')
    // An id alone, an unknown path or no relations: no URL.
    assert.equal(bindingValue(model, 'categories.1.$url', options), undefined)
    assert.equal(bindingValue(model, 'name.$url', options), undefined)
    assert.equal(bindingValue(model, 'categories.0.$url', { url }), undefined)
    assert.deepEqual(bindingPaths('link', 'categories.0.$url'), ['categories.0'])
  })
  it('RenderLayout resolves it in list items with the `relations` prop', () => {
    const layout: Layout = attachListItems(
      {
        version: 1,
        blocks: [
          {
            id: 'l',
            type: 'collectionList',
            props: { collection: 'models' },
            slots: { item: [{ id: 'k', type: 'link', bindings: { link: 'categories.0.$url' }, slots: { children: [{ id: 't', type: 'text', props: { text: 'Type' } }] } }] },
          },
        ],
      },
      new Map([['l', [model.doc]]]),
    )
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout, blocks: defaultBlocks(), resolveLink, relations }))
    assert.match(html, /href="\/categories\/vip"/)
  })
})
