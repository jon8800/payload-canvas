import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { defaultBlocks } from '../blocks'
import { RenderLayout } from '../react'
import { collectClasses } from './classes'
import { blockJsonSchema } from './schema'
import { applyOperation, applyOperations } from './operations'
import { normalizeLayout } from './tree'
import type { Layout } from './types'
import { validateLayout } from './validate'

const blocks = defaultBlocks()
const list = (): Layout => ({
  version: 1,
  blocks: [
    {
      id: 'l',
      type: 'collectionList',
      props: { collection: 'posts' },
      className: 'grid',
      slotClassName: { empty: 'col-span-full text-center' },
      slots: { empty: [{ id: 't', type: 'text', props: { text: 'Nothing yet' } }] },
    },
  ],
})

describe('slot classes', () => {
  it('update merges per slot, null removes, and the inverse restores the block', () => {
    const before = list()
    const result = applyOperation(before, { type: 'update', id: 'l', slotClassName: { empty: null } })
    assert.ok(result.ok)
    assert.equal('slotClassName' in result.layout.blocks[0], false)
    const undone = applyOperations(result.layout, result.inverse)
    assert.ok(undone.ok)
    assert.deepEqual(undone.layout, before)
    const set = applyOperation(before, { type: 'update', id: 'l', slotClassName: { empty: 'p-4' } })
    assert.ok(set.ok)
    assert.deepEqual(set.layout.blocks[0].slotClassName, { empty: 'p-4' })
    assert.equal(applyOperation(before, { type: 'update', id: 'l', slotClassName: { empty: 3 as never } }).ok, false)
  })
  it('are compiled, normalized and checked against the slot definition', () => {
    assert.ok(collectClasses(list()).includes('col-span-full'))
    assert.deepEqual(normalizeLayout({ blocks: [{ id: 'a', type: 'stack', slotClassName: { children: ' ', x: 5 } }] }).blocks[0], { id: 'a', type: 'stack' })
    assert.equal(validateLayout(list(), blocks).filter((e) => e.path.includes('slotClassName')).length, 0)
    const wrong: Layout = { version: 1, blocks: [{ id: 's', type: 'stack', slotClassName: { children: 'p-4' } }] }
    const errors = validateLayout(wrong, blocks).filter((e) => e.path.includes('slotClassName'))
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /takes no classes/)
  })
  it('render on the slot element; the schema lists the slots that take them', () => {
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: list(), blocks }))
    assert.match(html, /<div class="col-span-full text-center builder-css"><p>Nothing yet<\/p><\/div>/)
    const schema = blockJsonSchema(blocks.find((b) => b.type === 'collectionList')!, blocks) as { properties: Record<string, { properties?: object }> }
    assert.deepEqual(Object.keys(schema.properties.slotClassName?.properties ?? {}), ['empty'])
  })
})
