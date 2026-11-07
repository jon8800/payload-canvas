import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks'
import { prepareBlocks } from '../plugin/listCollections'
import { placementError, withInlineBlocks } from './blocks'
import type { BlockDefinition, Layout } from './types'
import { validateLayout } from './validate'

const icon: BlockDefinition = { type: 'icon', label: 'Icon', fields: [], inline: true }
const badge: BlockDefinition = { type: 'badge', label: 'Badge', fields: [] }
const layout: Layout = { version: 1, blocks: [{ id: 'l', type: 'link' }] }

const relationOf = (blocks: BlockDefinition[]) =>
  (blocks.find((b) => b.type === 'sectionRef')?.fields.find((f) => 'name' in f && f.name === 'section') as { relationTo?: string } | undefined)?.relationTo

describe('inline blocks', () => {
  it('a link accepts block types marked inline, and only those', () => {
    const raw = [...defaultBlocks(), icon, badge]
    assert.match(String(placementError(raw, layout, 'l', 'children', 'icon')), /Icon cannot go inside Link/)
    const blocks = withInlineBlocks(raw)
    assert.equal(placementError(blocks, layout, 'l', 'children', 'icon'), null)
    assert.match(String(placementError(blocks, layout, 'l', 'children', 'badge')), /cannot go inside Link/)
  })
  it('keeps the list as it is without inline blocks, and never overrides disallow', () => {
    const plain = defaultBlocks()
    assert.equal(withInlineBlocks(plain), plain)
    const button = { ...icon, type: 'button' }
    const blocks = withInlineBlocks([...plain.filter((b) => b.type !== 'button'), button])
    assert.ok(!blocks.find((b) => b.type === 'link')?.slots?.children?.allow?.includes('button'))
  })
})

describe('prepareBlocks', () => {
  it("validateLayout accepts inline blocks in a link with a site's own list; listCollections types picked ids", () => {
    const page: Layout = {
      version: 1,
      blocks: [
        { id: 'l', type: 'link', slots: { children: [{ id: 'i', type: 'icon' }] } },
        { id: 'c', type: 'collectionList', props: { collection: 'posts', ids: [{ relationTo: 'posts', value: 3 }] }, slots: { item: [] } },
      ],
    }
    const codes = (blocks: BlockDefinition[]) => validateLayout(page, blocks).map((e) => `${e.blockId} ${e.code}`)
    const raw = [...defaultBlocks(), icon]
    assert.ok(!codes(raw).some((c) => c.startsWith('i ')), 'validateLayout applies withInlineBlocks itself')
    assert.ok(codes(raw).some((c) => c.startsWith('c ')), 'without listCollections, ids are text')
    assert.deepEqual(codes([...defaultBlocks({ listCollections: ['posts', 'products'] }), icon]), [])
    const prepared = prepareBlocks(raw, ['posts', 'products'])
    assert.deepEqual(codes(prepared), [])
    assert.deepEqual(prepareBlocks(prepared, ['posts', 'products']), prepared)
  })

  it('adds the sectionRef block for the saved sections collection, once', () => {
    assert.equal(relationOf(prepareBlocks(defaultBlocks())), undefined)
    const once = prepareBlocks(defaultBlocks(), [], 'site-sections')
    assert.equal(relationOf(once), 'site-sections')
    const twice = prepareBlocks(once, [], 'other-sections')
    assert.equal(twice.filter((b) => b.type === 'sectionRef').length, 1)
    assert.equal(relationOf(twice), 'other-sections')
  })
})
