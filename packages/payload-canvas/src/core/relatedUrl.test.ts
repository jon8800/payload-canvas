import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { defaultBlocks } from '../blocks'
import { attachListItems, loadLayoutData, RenderLayout, type ResolveLink } from '../react'
import { bindingPaths, bindingRelations, bindingValue, type BindingOptions } from './bindings'
import type { Layout, TemplateContext } from './types'

const collections = [
  {
    slug: 'posts',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
      { name: 'source', type: 'relationship', relationTo: ['authors', 'pages'] },
      { name: 'gallery', type: 'array', fields: [{ name: 'photo', type: 'upload', relationTo: 'media' }] },
      { type: 'row', fields: [{ name: 'venue', type: 'relationship', relationTo: 'venues' }] },
    ],
  },
  { slug: 'venues', fields: [{ name: 'city', type: 'relationship', relationTo: 'cities' }] },
  { slug: 'plain', fields: [{ name: 'title', type: 'text' }] },
]
const relations = bindingRelations(collections)
const url: BindingOptions['url'] = (context) => `/${context.collection}/${String(context.doc.slug)}`
const post: TemplateContext = {
  collection: 'posts',
  doc: {
    id: 1,
    slug: 'hello',
    categories: [{ id: 3, slug: 'news' }, 4],
    source: { relationTo: 'authors', value: { id: 9, slug: 'jane' } },
    venue: { id: 2, slug: 'town-hall', city: { id: 5, slug: 'springfield' } },
  },
}

const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url ?? null
  const doc = link.reference?.value as { slug?: string } | undefined
  return doc?.slug ? `/${link.reference?.relationTo}/${doc.slug}` : null
}

const listLayout: Layout = {
  version: 1,
  blocks: [
    {
      id: 'l',
      type: 'collectionList',
      props: { collection: 'posts' },
      slots: { item: [{ id: 'k', type: 'link', bindings: { link: 'categories.0.$url' }, slots: { children: [{ id: 't', type: 'text', props: { text: 'Category' } }] } }] },
    },
  ],
}

describe('$url of related documents', () => {
  it('bindingRelations maps each relationship path to its collection', () => {
    assert.deepEqual(relations, {
      posts: { categories: 'categories', 'gallery.photo': 'media', venue: 'venues' },
      venues: { city: 'cities' },
    })
  })
  it('<path>.$url links to the related document, through rows and several hops', () => {
    const options = { url, relations }
    assert.equal(bindingValue(post, 'categories.0.$url', options), '/categories/news')
    assert.equal(bindingValue(post, 'venue.city.$url', options), '/cities/springfield')
    // A { relationTo, value } pair names its own collection.
    assert.equal(bindingValue(post, 'source.$url', { url }), '/authors/jane')
    // An id alone, an unknown path or no relations: no URL.
    assert.equal(bindingValue(post, 'categories.1.$url', options), undefined)
    assert.equal(bindingValue(post, 'title.$url', options), undefined)
    assert.equal(bindingValue(post, 'categories.0.$url', { url }), undefined)
    assert.deepEqual(bindingPaths('categories.0.$url'), ['categories.0'])
  })
  it('RenderLayout resolves it in list items with the `relations` prop (the canvas)', () => {
    const layout = attachListItems(listLayout, new Map([['l', [post.doc]]]))
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout, blocks: defaultBlocks(), resolveLink, relations }))
    assert.match(html, /href="\/categories\/news"/)
  })
  it('loadLayoutData reads the relations from the Payload config: the site passes them nowhere', async () => {
    const payload = {
      config: { collections },
      collections: { posts: { config: {} } },
      find: async () => ({ docs: [post.doc], totalPages: 1 }),
      logger: { error() {} },
    }
    const layout = await loadLayoutData(listLayout, defaultBlocks(), payload as never)
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout, blocks: defaultBlocks(), resolveLink }))
    assert.match(html, /href="\/categories\/news"/)
    // The runtime prop never reaches the component's props as HTML.
    assert.doesNotMatch(html, /\$relations/)
  })
})
