import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CollectionConfig, Config } from 'payload'

import type { BuilderClientConfig } from '../core/types'
import { BUILDER_CONFIG_KEY, type BuilderServerConfig } from '../live/document'
import { websiteBuilder } from './index'

const media: CollectionConfig = { slug: 'media', upload: true, fields: [{ name: 'alt', type: 'text' }] }
const pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, validate: () => true as const },
    {
      type: 'tabs',
      tabs: [{ label: 'Header', fields: [{ name: 'intro', type: 'textarea' }, { name: 'cover', type: 'upload', relationTo: 'media' }] }],
    },
    { name: 'oldBlocks', type: 'json' },
  ],
}
const posts: CollectionConfig = { slug: 'posts', fields: [{ name: 'title', type: 'text' }] }
const base: Config = { collections: [media, pages, posts], secret: 'x' } as Config

const build = (regions?: unknown, extra: Record<string, unknown> = {}) =>
  websiteBuilder({
    collections: { pages: { ...(regions ? { regions: regions as never } : {}), ...extra }, posts: {} },
    css: { entry: 'globals.css' },
  })(base) as Config

const clientConfig = (config: Config, slug: string) => {
  const field = config.collections!.find((c) => c.slug === slug)!.fields.find((f) => 'name' in f && f.name === 'layout') as {
    admin: { custom: { builder: BuilderClientConfig } }
  }
  return field.admin.custom.builder
}
const paths = (config: Config) => (config.endpoints ?? []).map((e) => e.path)

describe('websiteBuilder regions option', () => {
  it('gives the editor and the server the region fields, with labels, tabs and no functions', () => {
    const config = build([{ name: 'header', fields: ['title', 'intro', 'cover'] }])
    const regions = clientConfig(config, 'pages').regions
    assert.equal(regions?.length, 1)
    assert.deepEqual(
      regions?.[0].fields.map((f) => [f.path, f.label, f.tabs]),
      [
        ['title', 'Title', []],
        ['intro', 'Intro', ['Header']],
        ['cover', 'Cover', ['Header']],
      ],
    )
    assert.ok(regions)
    assert.equal(typeof (regions[0].fields[0].field as { validate?: unknown }).validate, 'undefined', 'the client config is JSON-safe')
    const server = config.custom?.[BUILDER_CONFIG_KEY] as BuilderServerConfig
    assert.equal(server.collections.pages.regions?.[0].name, 'header')
    assert.equal(server.collections.posts.regions, undefined)
    assert.ok(paths(config).includes('/builder/live/:collection/:id/regions'))
    assert.ok(paths(config).includes('/builder/live/:collection/:id/fields'))
  })

  it('changes nothing for sites without regions: no regions in the editor, no region endpoints', () => {
    const config = build()
    assert.equal('regions' in clientConfig(config, 'pages'), false)
    assert.equal('regions' in clientConfig(config, 'posts'), false)
    assert.ok(!paths(config).some((p) => p.endsWith('/regions') || p.endsWith('/fields')))
    assert.equal(build([]).endpoints?.some((e) => e.path.endsWith('/fields')), false, 'an empty list is no regions')
  })

  it('refuses region fields that Publish or the builder would overwrite', () => {
    assert.throws(() => build([{ name: 'header', fields: ['layout'] }]), /which the builder owns/)
    assert.throws(() => build([{ name: 'header', fields: ['oldBlocks'] }], { legacyFields: ['oldBlocks'] }), /legacyFields/)
    assert.throws(() => build([{ name: 'header', fields: ['missing'] }]), /not a field of the collection/)
    assert.throws(() => build({ name: 'header' }), /must be a list/)
  })

  it('puts every update of every builder collection through the write gate, with or without regions', () => {
    for (const config of [build(), build([{ name: 'header', fields: ['title'] }])]) {
      for (const slug of ['pages', 'posts']) {
        const hooks = config.collections!.find((c) => c.slug === slug)!.hooks!
        assert.ok((hooks.beforeOperation?.length ?? 0) >= 2, `${slug}: gate and lock hooks`)
        assert.equal(hooks.afterOperation?.length, 1)
        assert.equal(hooks.afterError?.length, 1)
      }
    }
    // A failed GraphQL or REST request ends its saves (the config-level afterError).
    assert.equal(build().hooks?.afterError?.length, 1)
    // Collections the builder does not edit keep their hooks.
    assert.equal(build().collections!.find((c) => c.slug === 'media')!.hooks?.afterOperation, undefined)
  })
})
