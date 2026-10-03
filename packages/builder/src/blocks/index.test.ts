import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { layoutJsonSchema } from '../core/schema'
import { validateLayout } from '../core/validate'
import { defaultBlocks } from './index'

describe('defaultBlocks', () => {
  it('has the five built-in blocks', () => {
    assert.deepEqual(
      defaultBlocks().map((b) => b.type),
      ['stack', 'grid', 'heading', 'text', 'image'],
    )
  })

  it('is plain JSON data, so it can reach the admin client', () => {
    const blocks = defaultBlocks()
    assert.deepStrictEqual(JSON.parse(JSON.stringify(blocks)), blocks)
  })

  it('uses the media collection option', () => {
    const image = defaultBlocks({ mediaCollection: 'assets' }).find((b) => b.type === 'image')
    const field = image?.fields[0] as { relationTo?: string } | undefined
    assert.equal(field?.relationTo, 'assets')
  })

  it('every AI example is a valid block', () => {
    const blocks = defaultBlocks()
    for (const def of blocks) {
      assert.ok(def.ai?.description, `${def.type} has no AI description`)
      const layout = { version: 1, blocks: [{ id: 'b_example', type: def.type, ...def.ai?.example }] }
      assert.deepEqual(validateLayout(layout, blocks), [], def.type)
    }
  })

  it('produces a serializable layout schema', () => {
    const schema = layoutJsonSchema(defaultBlocks())
    assert.deepEqual(Object.keys(schema.$defs as object), ['stack', 'grid', 'heading', 'text', 'image'])
  })
})
