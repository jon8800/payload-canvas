import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks'
import { placementError, withInlineBlocks } from './blocks'
import type { BlockDefinition, Layout } from './types'

const icon: BlockDefinition = { type: 'icon', label: 'Icon', fields: [], inline: true }
const badge: BlockDefinition = { type: 'badge', label: 'Badge', fields: [] }
const layout: Layout = { version: 1, blocks: [{ id: 'l', type: 'link' }] }

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
