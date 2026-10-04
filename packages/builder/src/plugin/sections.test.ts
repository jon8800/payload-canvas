import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block, SectionDefinition } from '../core/types'
import { findSection, savedSectionData, savedSectionsConfigOf, SAVED_SECTIONS_CONFIG_KEY, toSavedSection } from './sections'

const block: Block = { id: 'b1', type: 'stack', slots: { children: [{ id: 'b2', type: 'heading', props: { text: 'Hi' } }] } }

describe('toSavedSection', () => {
  it('turns a document into a section with a saved: id', () => {
    assert.deepEqual(toSavedSection({ id: 12, name: '  Team   intro ', category: 'Team', blocks: [block] }), {
      id: 'saved:12',
      label: 'Team intro',
      category: 'Team',
      blocks: [block],
      savedId: 12,
    })
  })

  it('falls back to a default name and leaves out an empty category', () => {
    const section = toSavedSection({ id: 'a1', name: ' ', category: '', blocks: [block] })
    assert.equal(section?.label, 'Untitled section')
    assert.equal(section && 'category' in section, false)
  })

  it('returns null without an id or without blocks', () => {
    assert.equal(toSavedSection({ name: 'X', blocks: [block] }), null)
    assert.equal(toSavedSection({ id: 1, name: 'X', blocks: [] }), null)
    assert.equal(toSavedSection({ id: 1, name: 'X', blocks: 'nope' }), null)
  })

  it('stores blocks in canonical form', () => {
    const section = toSavedSection({ id: 1, name: 'X', blocks: [{ id: 'c', type: 'stack', props: {}, slots: { children: [] } }] })
    assert.deepEqual(section?.blocks, [{ id: 'c', type: 'stack' }])
  })
})

describe('savedSectionData', () => {
  it('trims the name and category and keeps the block ids', () => {
    assert.deepEqual(savedSectionData(block, '  Hero  ', ' Heroes '), { name: 'Hero', category: 'Heroes', blocks: [block] })
  })

  it('uses the fallback name and a null category', () => {
    assert.deepEqual(savedSectionData(block, '', null, 'Stack'), { name: 'Stack', category: null, blocks: [block] })
    assert.equal(savedSectionData(block, '   ').name, 'Untitled section')
  })

  it('cuts long names and categories', () => {
    const data = savedSectionData(block, 'n'.repeat(500), 'c'.repeat(500))
    assert.equal(data.name.length, 120)
    assert.equal(data.category?.length, 60)
  })
})

describe('findSection', () => {
  const hero: SectionDefinition = { id: 'hero', label: 'Hero', blocks: [block] }
  const saved: SectionDefinition = { id: 'saved:12', label: 'Team Intro', blocks: [block], savedId: 12 }
  const named: SectionDefinition = { id: 'saved:13', label: 'hero', blocks: [block], savedId: 13 }
  const sections = [hero, saved, named]

  it('finds by id, saved id or document id', () => {
    assert.equal(findSection(sections, 'hero'), hero)
    assert.equal(findSection(sections, 'saved:12'), saved)
    assert.equal(findSection(sections, ' 12 '), saved)
  })

  it('finds by name, case-insensitive', () => {
    assert.equal(findSection(sections, 'team intro'), saved)
  })

  it('prefers ids over names', () => {
    assert.equal(findSection([named, hero], 'hero'), hero)
  })

  it('returns undefined for an empty or unknown ref', () => {
    assert.equal(findSection(sections, ''), undefined)
    assert.equal(findSection(sections, 'saved:99'), undefined)
  })
})

describe('savedSectionsConfigOf', () => {
  it('reads the slug from config.custom', () => {
    assert.deepEqual(savedSectionsConfigOf({ config: { custom: { [SAVED_SECTIONS_CONFIG_KEY]: { slug: 'builder-sections' } } } }), {
      slug: 'builder-sections',
    })
    assert.equal(savedSectionsConfigOf({ config: {} }), null)
  })
})
