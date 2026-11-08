// The public surface of `payload-canvas/blocks`. The test imports the package by its own name, so
// Node resolves the entry through package.json `exports`, as a site does. The build maps the same
// entry to `dist/blocks/index.js` (scripts/build-package.mjs checks it). 0.5.0 dropped
// `prepareBlocks` and `listCollectionsOf` from this entry without a note; this test stops that.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { defaultBlocks, listCollectionsOf, prepareBlocks } from 'payload-canvas/blocks'
import { validateLayout } from 'payload-canvas/core'

/** Documented exports of `payload-canvas/blocks` that sites call at runtime. */
const PUBLIC_FUNCTIONS = [
  'builtinBlocks',
  'defaultBlocks',
  'defineBlock',
  'defineSection',
  'fromPayloadBlocks',
  'linkField',
  'listCollectionsOf',
  'prepareBlocks',
  'withBuilderCssClass',
  'withInlineBlocks',
]

describe('payload-canvas/blocks exports', () => {
  it('has every documented function', async () => {
    const entry: Record<string, unknown> = await import('payload-canvas/blocks')
    for (const name of PUBLIC_FUNCTIONS) assert.equal(typeof entry[name], 'function', name)
  })

  it('prepareBlocks and listCollectionsOf keep their signatures', () => {
    const blocks = defaultBlocks()
    const prepared = prepareBlocks(blocks, ['posts', 'testimonials'])
    const list = prepared.find((block) => block.type === 'collectionList')
    const collection = list?.fields.find((field) => 'name' in field && field.name === 'collection')
    assert.equal(collection?.type, 'select')
    assert.equal(listCollectionsOf(blocks, []), blocks)
    assert.deepEqual(validateLayout({ version: 1, blocks: [] }, prepared), [])
  })
})
