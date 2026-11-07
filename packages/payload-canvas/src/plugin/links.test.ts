import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CollectionConfig, Config } from 'payload'

import type { BuilderClientConfig } from '../core/types'
import { websiteBuilder } from './index'
import { editViewPath, listViewPath, opensInBuilder } from './links'

describe('admin paths', () => {
  it('builds the edit view path, with the form flag on request', () => {
    assert.equal(editViewPath('/admin', 'pages', 12), '/admin/collections/pages/12')
    assert.equal(editViewPath('/admin', 'pages', 12, { form: true }), '/admin/collections/pages/12?form=1')
    assert.equal(editViewPath('/', 'my pages', 'a/b'), '/collections/my%20pages/a%2Fb')
    assert.equal(listViewPath('/admin', 'pages'), '/admin/collections/pages')
  })
})

describe('opensInBuilder', () => {
  const open = { option: true, id: 12, canSave: true, trashed: false, inDrawer: false, formParam: null }

  it('opens a saved document in the builder when the option is on', () => {
    assert.equal(opensInBuilder(open), true)
  })

  it('keeps the form in every other case', () => {
    assert.equal(opensInBuilder({ ...open, option: false }), false)
    assert.equal(opensInBuilder({ ...open, id: undefined }), false, 'a new document')
    assert.equal(opensInBuilder({ ...open, id: '' }), false)
    assert.equal(opensInBuilder({ ...open, canSave: false }), false, 'a read-only user (the builder sends them here)')
    assert.equal(opensInBuilder({ ...open, trashed: true }), false)
    assert.equal(opensInBuilder({ ...open, inDrawer: true }), false, 'a document drawer, also the builder’s settings drawer')
    assert.equal(opensInBuilder({ ...open, formParam: '1' }), false, '“All fields” in the builder')
  })
})

const editView = (config: Config, slug: string) => {
  const edit = config.collections!.find((c) => c.slug === slug)!.admin?.components?.views?.edit as Record<string, { Component?: unknown }> | undefined
  return edit?.default
}
const editorConfig = (config: Config) => {
  const field = config.collections!.find((c) => c.slug === 'pages')!.fields.find((f) => 'name' in f && f.name === 'layout') as {
    admin: { custom: { builder: BuilderClientConfig } }
  }
  return field.admin.custom.builder.editor
}

describe('websiteBuilder editor.openInBuilder', () => {
  const pages: CollectionConfig = { slug: 'pages', fields: [{ name: 'title', type: 'text' }] }
  const custom: CollectionConfig = {
    slug: 'posts',
    fields: [{ name: 'title', type: 'text' }],
    admin: { components: { views: { edit: { default: { Component: './MyEdit#MyEdit' } } } } },
  }
  const build = (openInBuilder?: boolean) =>
    websiteBuilder({
      collections: { pages: {}, posts: {} },
      css: { entry: 'globals.css' },
      ...(openInBuilder === undefined ? {} : { editor: { openInBuilder } }),
    })({ collections: [pages, custom], secret: 'x' } as Config) as Config

  it('is off by default: Payload’s edit view stays', () => {
    const config = build()
    assert.equal(editView(config, 'pages'), undefined)
    assert.equal(editorConfig(config).openInBuilder, false)
  })

  it('replaces the default edit view and tells the editor', () => {
    const config = build(true)
    assert.deepEqual(editView(config, 'pages'), { Component: 'payload-canvas/client#DocumentEditView' })
    assert.equal(editorConfig(config).openInBuilder, true)
  })

  it('keeps a default edit view the collection sets itself', () => {
    assert.deepEqual(editView(build(true), 'posts'), { Component: './MyEdit#MyEdit' })
  })
})
