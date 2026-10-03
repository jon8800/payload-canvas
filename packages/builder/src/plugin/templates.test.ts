import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CollectionConfig, Config, Field } from 'payload'

import type { BindingField, BuilderClientConfig } from '../core/types'
import { websiteBuilder } from './index'
import { bindingSources, TEMPLATES_CONFIG_KEY } from './templates'

const media: CollectionConfig = { slug: 'media', upload: true, fields: [{ name: 'alt', type: 'text' }] }
const users: CollectionConfig = { slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }
const categories: CollectionConfig = { slug: 'categories', fields: [{ name: 'title', type: 'text' }] }
const posts: CollectionConfig = {
  slug: 'posts',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'secret', type: 'text', admin: { hidden: true } },
    { name: 'note', type: 'ui', admin: { components: { Field: 'x' } } } as Field,
    { type: 'row', fields: [{ name: 'excerpt', type: 'textarea', label: 'Summary' }] },
    { name: 'seo', type: 'group', fields: [{ name: 'description', type: 'text' }] },
    { type: 'tabs', tabs: [{ name: 'extra', fields: [{ name: 'color', type: 'text' }] }] },
    { name: 'layout', type: 'json' },
  ],
}
const pages: CollectionConfig = { slug: 'pages', fields: [{ name: 'title', type: 'text' }] }

const find = (list: BindingField[] | undefined, path: string) => list?.find((f) => f.path === path)

describe('bindingSources', () => {
  const sources = bindingSources({
    collections: [media, users, categories, posts, pages],
    slugs: ['posts', 'media'],
    skip: { posts: new Set(['layout']) },
    withUrl: new Set(['posts']),
  })
  const list = sources.posts

  it('lists named fields with labels, groups and named tabs as children', () => {
    assert.equal(find(list, 'title')?.type, 'text')
    assert.equal(find(list, 'excerpt')?.label, 'Summary')
    assert.equal(find(list, 'featuredImage')?.label, 'Featured image')
    assert.deepEqual(find(list, 'seo')?.children?.map((f) => f.path), ['seo.description'])
    assert.deepEqual(find(list, 'extra')?.children?.map((f) => f.path), ['extra.color'])
  })
  it('skips hidden, ui and plugin fields and adds id and timestamps', () => {
    for (const path of ['secret', 'note', 'layout']) assert.equal(find(list, path), undefined)
    for (const path of ['id', 'createdAt', 'updatedAt']) assert.ok(find(list, path), path)
  })
  it('starts with $url for collections with a url', () => {
    assert.equal(list[0].path, '$url')
    assert.equal(find(sources.media, '$url'), undefined)
  })
  it('follows relationships one hop, uploads with their file data', () => {
    const image = find(list, 'featuredImage')!
    assert.equal(image.relationTo, 'media')
    const paths = image.children!.map((f) => f.path)
    for (const path of ['featuredImage.alt', 'featuredImage.url', 'featuredImage.width']) assert.ok(paths.includes(path), path)
    const author = find(list, 'author')!
    assert.ok(author.children!.some((f) => f.path === 'author.email'))
    assert.ok(author.children!.some((f) => f.path === 'author.name'))
    const cats = find(list, 'categories')!
    assert.equal(cats.hasMany, true)
    assert.ok(cats.children!.some((f) => f.path === 'categories.title'))
  })
  it('gives upload collections their file fields and is JSON-safe', () => {
    assert.ok(find(sources.media, 'url'))
    assert.deepEqual(JSON.parse(JSON.stringify(sources)), sources)
  })
})

describe('websiteBuilder with templates', () => {
  const base: Config = { collections: [media, users, categories, posts, pages] } as Config
  const config = websiteBuilder({
    collections: {
      posts: { templates: true, url: (doc) => `/blog/${String(doc.slug)}` },
      pages: { url: (doc) => `/${String(doc.slug)}` },
    },
    css: { entry: 'globals.css' },
  })(base) as Config
  const bySlug = (slug: string) => config.collections!.find((c) => c.slug === slug)!
  const builderConfig = (slug: string, field = 'layout') => {
    const f = bySlug(slug).fields.find((x) => 'name' in x && x.name === field) as { admin: { custom: { builder: BuilderClientConfig } } }
    return f.admin.custom.builder
  }

  it('adds the templates collection with its fields and the builder field', () => {
    const templates = bySlug('builder-templates')
    const names = templates.fields.flatMap((f) => ('name' in f ? [f.name] : []))
    for (const name of ['name', 'targetCollection', 'isDefault', 'previewDocument', 'layout', 'layoutCss']) {
      assert.ok(names.includes(name), name)
    }
    const target = templates.fields.find((f) => 'name' in f && f.name === 'targetCollection') as { options: string[] }
    assert.deepEqual(target.options, ['posts'])
    assert.ok(templates.versions && typeof templates.versions === 'object' && templates.versions.drafts)
  })
  it('adds a template relationship to template-enabled collections only', () => {
    const field = bySlug('posts').fields.find((f) => 'name' in f && f.name === 'template') as { relationTo: string; filterOptions: unknown }
    assert.equal(field.relationTo, 'builder-templates')
    assert.deepEqual(field.filterOptions, { targetCollection: { equals: 'posts' } })
    assert.ok(!bySlug('pages').fields.some((f) => 'name' in f && f.name === 'template'))
  })
  it('puts the templates data on every builder field and on the server config', () => {
    for (const slug of ['posts', 'pages', 'builder-templates']) {
      const templates = builderConfig(slug).templates
      assert.equal(templates?.collection, 'builder-templates')
      assert.equal(templates?.targetField, 'targetCollection')
      assert.ok(templates?.sources.posts && templates.sources.pages, slug)
    }
    const postFields = builderConfig('posts').templates!.sources.posts
    assert.ok(!postFields.some((f) => ['layout', 'layoutCss', 'template'].includes(f.path)))
    assert.ok((config.custom as Record<string, unknown>)[TEMPLATES_CONFIG_KEY])
  })
  it('limits the collection list to collections with a url', () => {
    const list = builderConfig('pages').blocks.find((b) => b.type === 'collectionList')!
    const field = list.fields.find((f) => 'name' in f && f.name === 'collection') as { type: string; options: string[] }
    assert.equal(field.type, 'select')
    assert.deepEqual(field.options, ['posts', 'pages'])
  })
  it('has no templates when no collection asks for them', () => {
    const plain = websiteBuilder({ collections: { pages: {} }, css: { entry: 'globals.css' } })(base) as Config
    assert.ok(!plain.collections!.some((c) => c.slug === 'builder-templates'))
    const f = plain.collections!.find((c) => c.slug === 'pages')!.fields.find((x) => 'name' in x && x.name === 'layout') as {
      admin: { custom: { builder: BuilderClientConfig } }
    }
    assert.equal(f.admin.custom.builder.templates, null)
  })
})
