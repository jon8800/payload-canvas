import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks, prepareBlocks } from '../blocks'
import { placementError, withInlineBlocks } from './blocks'
import type { BlockDefinition, Layout } from './types'
import { validateLayout } from './validate'

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

describe('prepareBlocks', () => {
  it("gives a site's own block list the plugin's rules, so validateLayout agrees with the editor", () => {
    const raw = [...defaultBlocks(), icon]
    const page: Layout = {
      version: 1,
      blocks: [
        { id: 'l', type: 'link', slots: { children: [{ id: 'i', type: 'icon' }] } },
        { id: 'c', type: 'collectionList', props: { collection: 'posts', ids: [{ relationTo: 'posts', value: 3 }] }, slots: { item: [] } },
      ],
    }
    const codes = (blocks: BlockDefinition[]) => validateLayout(page, blocks).map((e) => `${e.blockId} ${e.code}`)
    assert.ok(codes(raw).some((c) => c.startsWith('i ')), 'the raw list refuses the icon in the link')
    assert.ok(codes(raw).some((c) => c.startsWith('c ')), 'the raw list checks ids as text')
    const prepared = prepareBlocks(raw, ['posts', 'models'])
    assert.deepEqual(codes(prepared), [])
    assert.deepEqual(prepareBlocks(prepared, ['posts', 'models']), prepared)
  })
})
