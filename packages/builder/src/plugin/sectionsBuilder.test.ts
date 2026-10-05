import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block } from '../core/types'
import { savedSectionsCollection, SECTION_LAYOUT_FIELD } from './sections'
import { syncSectionBlocks } from './sectionsBuilder'

const block: Block = { id: 'b1', type: 'stack', slots: { children: [{ id: 'b2', type: 'heading', props: { text: 'Hi' } }] } }

const other: Block = { id: 'b9', type: 'heading', props: { text: 'Other' } }
const layoutOf = (list: Block[]) => ({ version: 1, blocks: list })
const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>, context: Record<string, unknown> = {}) =>
  syncSectionBlocks({ data, originalDoc, context } as never) as Record<string, unknown>

describe('saved sections in the builder', () => {
  it('stores a changed layout as the blocks', () => {
    assert.deepEqual(run({ [SECTION_LAYOUT_FIELD]: layoutOf([other]), blocks: [block] }, { blocks: [block] }).blocks, [other])
  })

  it('keeps new blocks from the API when the layout is the stored one (Payload merges the stored document in)', () => {
    assert.deepEqual(run({ [SECTION_LAYOUT_FIELD]: layoutOf([block]), blocks: [other] }, { blocks: [block] }).blocks, [other])
    assert.deepEqual(run({ name: 'X', blocks: [block] }).blocks, [block])
  })

  it('gives the live session the last word: its own saves and guarded saves', () => {
    assert.deepEqual(run({ [SECTION_LAYOUT_FIELD]: layoutOf([block]), blocks: [other] }, { blocks: [block] }, { builderSession: true }).blocks, [block])
    assert.deepEqual(run({ [SECTION_LAYOUT_FIELD]: layoutOf([block]), blocks: [other] }, { blocks: [block] }, { builderSessionSeq: 3 }).blocks, [block])
  })

  it('reads the virtual layout from the stored blocks', () => {
    const collection = savedSectionsCollection({ slug: 'builder-sections', blocks: [] })
    const field = collection.fields.find((f) => 'name' in f && f.name === SECTION_LAYOUT_FIELD) as {
      virtual?: boolean
      hooks?: { afterRead?: ((args: Record<string, unknown>) => unknown)[] }
    }
    assert.equal(field.virtual, true)
    const read = field.hooks?.afterRead?.[0]
    assert.deepEqual(read?.({ siblingData: { blocks: [block] }, value: undefined }), { version: 1, blocks: [block] })
    assert.deepEqual(read?.({ siblingData: {}, value: undefined }), { version: 1, blocks: [] })
  })
})
