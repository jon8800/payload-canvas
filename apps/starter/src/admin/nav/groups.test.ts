import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { groupEntities, isActivePath, type NavEntity } from './groups'

const entity = (slug: string, group = 'Collections', type: NavEntity['type'] = 'collections'): NavEntity => ({
  slug,
  type,
  label: slug,
  group,
})

describe('groupEntities', () => {
  it('puts entities into the configured groups, in the configured order', () => {
    const sections = groupEntities([entity('media'), entity('posts'), entity('pages')], [
      { label: 'Site', slugs: ['pages', 'posts'] },
      { label: 'Content', slugs: ['media'] },
    ])
    assert.deepEqual(
      sections.map((section) => [section.label, section.entities.map((item) => item.slug)]),
      [
        ['Site', ['pages', 'posts']],
        ['Content', ['media']],
      ],
    )
  })

  it('keeps the Payload group of entities no group lists, after the configured groups', () => {
    const sections = groupEntities([entity('pages'), entity('api-keys', 'MCP'), entity('theme', 'Settings', 'globals')], [
      { label: 'Site', slugs: ['pages'] },
      { label: 'Settings', slugs: ['site-settings'] },
    ])
    assert.deepEqual(
      sections.map((section) => [section.label, section.entities.map((item) => item.slug)]),
      [
        ['Site', ['pages']],
        ['MCP', ['api-keys']],
        ['Settings', ['theme']],
      ],
    )
  })

  it('adds an unlisted entity to a configured group with the same label', () => {
    const sections = groupEntities([entity('site-settings', 'Globals', 'globals'), entity('theme', 'Settings', 'globals')], [
      { label: 'Settings', slugs: ['site-settings'] },
    ])
    assert.deepEqual(sections, [{ label: 'Settings', entities: [entity('site-settings', 'Globals', 'globals'), entity('theme', 'Settings', 'globals')] }])
  })

  it('leaves out empty groups and slugs the user cannot see', () => {
    const sections = groupEntities([entity('pages')], [
      { label: 'Site', slugs: ['pages', 'posts'] },
      { label: 'Content', slugs: ['media'] },
    ])
    assert.deepEqual(sections.map((section) => section.label), ['Site'])
  })

  it('places a slug once, even when two groups list it', () => {
    const sections = groupEntities([entity('pages')], [
      { label: 'Site', slugs: ['pages'] },
      { label: 'Other', slugs: ['pages'] },
    ])
    assert.equal(sections.length, 1)
  })
})

describe('isActivePath', () => {
  it('matches the page and the pages below it', () => {
    assert.equal(isActivePath('/admin/collections/pages', '/admin/collections/pages'), true)
    assert.equal(isActivePath('/admin/collections/pages/12', '/admin/collections/pages'), true)
  })

  it('does not match a slug that only starts the same', () => {
    assert.equal(isActivePath('/admin/collections/pages-old', '/admin/collections/pages'), false)
  })
})
