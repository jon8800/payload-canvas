import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { defaultBlocks, sectionRefBlock } from '../blocks'
import { componentListing, sectionToInsert } from '../mcp/shared'
import type { SectionDefinition } from '../core/types'
import { containsSection, sectionRefIds } from './sections'

const ref = (id: string, section: number) => ({ id, type: 'sectionRef', props: { section } })

describe('containsSection', () => {
  const stored: Record<string, unknown> = {
    '1': [ref('a', 2)],
    '2': [{ id: 's', type: 'stack', slots: { children: [ref('b', 3)] } }],
    '3': [{ id: 'h', type: 'heading', props: { text: 'Leaf' } }],
  }
  const load = async (ids: string[]) => new Map(ids.filter((id) => id in stored).map((id) => [id, stored[id]]))

  test('finds a copy of the section itself, at any depth', async () => {
    assert.deepEqual(sectionRefIds([{ id: 'x', type: 'stack', slots: { children: [ref('a', 5), ref('b', 5)] } }]), ['5'])
    assert.equal(await containsSection('9', [ref('a', 9)], load), true)
    assert.equal(await containsSection('3', [ref('a', 1)], load), true)
    assert.equal(await containsSection('7', [ref('a', 1)], load), false)
    assert.equal(await containsSection('3', [{ id: 'h', type: 'heading' }], load), false)
  })
})

describe('MCP: components', () => {
  const blocks = [...defaultBlocks(), sectionRefBlock()]
  const component: SectionDefinition = {
    id: 'saved:4',
    label: 'Card',
    savedId: 4,
    blocks: [{ id: 'h', type: 'heading', props: { text: 'Default' }, bindings: { text: '$component.title' } }],
  }

  test('listSections shows the properties of components only', () => {
    assert.deepEqual(componentListing(component, blocks), { component: true, properties: [{ name: 'title', type: 'text', default: 'Default' }] })
    assert.deepEqual(componentListing({ ...component, savedId: undefined }, blocks), {})
  })

  test('insertSection puts in a linked copy with values, or plain blocks', () => {
    const linked = sectionToInsert(component, blocks, { values: { title: 'Mine' } })
    assert.ok(typeof linked !== 'string')
    assert.deepEqual(linked.blocks, [{ id: 'component', type: 'sectionRef', props: { section: 4, values: { title: 'Mine' } } }])
    const plain = sectionToInsert(component, blocks, { values: { title: 'Mine' }, linked: false })
    assert.ok(typeof plain !== 'string')
    assert.deepEqual(plain.blocks, [{ id: 'h', type: 'heading', props: { text: 'Mine' } }])
    assert.match(String(sectionToInsert(component, blocks, { values: { nope: 1 } })), /Unknown property "nope"/)
    assert.match(String(sectionToInsert(component, defaultBlocks(), {})), /turned off/)
    assert.match(String(sectionToInsert({ ...component, savedId: undefined }, blocks, { linked: true })), /Only saved sections/)
  })
})
