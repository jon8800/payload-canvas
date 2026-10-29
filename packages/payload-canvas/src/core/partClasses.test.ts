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
      partClassName: { empty: 'col-span-full text-center' },
      slots: { empty: [{ id: 't', type: 'text', props: { text: 'Nothing yet' } }] },
    },
  ],
})

describe('part classes', () => {
  it('update merges per part, null removes, and the inverse restores the block', () => {
    const before = list()
    const result = applyOperation(before, { type: 'update', id: 'l', partClassName: { empty: null } })
    assert.ok(result.ok)
    assert.equal('partClassName' in result.layout.blocks[0], false)
    const undone = applyOperations(result.layout, result.inverse)
    assert.ok(undone.ok)
    assert.deepEqual(undone.layout, before)
    const set = applyOperation(before, { type: 'update', id: 'l', partClassName: { empty: 'p-4' } })
    assert.ok(set.ok)
    assert.deepEqual(set.layout.blocks[0].partClassName, { empty: 'p-4' })
    assert.equal(applyOperation(before, { type: 'update', id: 'l', partClassName: { empty: 3 as never } }).ok, false)
  })
  it('are compiled, normalized and checked against the block parts', () => {
    assert.ok(collectClasses(list()).includes('col-span-full'))
    assert.deepEqual(normalizeLayout({ blocks: [{ id: 'a', type: 'stack', partClassName: { children: ' ', x: 5 } }] }).blocks[0], { id: 'a', type: 'stack' })
    assert.equal(validateLayout(list(), blocks).filter((e) => e.path.includes('partClassName')).length, 0)
    const wrong: Layout = { version: 1, blocks: [{ id: 's', type: 'stack', partClassName: { children: 'p-4' } }] }
    const errors = validateLayout(wrong, blocks).filter((e) => e.path.includes('partClassName'))
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /has no part "children"/)
    const pager: Layout = { version: 1, blocks: [{ ...list().blocks[0]!, partClassName: { pager: 'flex gap-2', pageLink: 'px-2' } }] }
    assert.equal(validateLayout(pager, blocks).filter((e) => e.path.includes('partClassName')).length, 0)
  })
  it('render on the slot element; the schema lists the parts that take them', () => {
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: list(), blocks }))
    assert.match(html, /<div class="col-span-full text-center builder-css"><p>Nothing yet<\/p><\/div>/)
    const schema = blockJsonSchema(blocks.find((b) => b.type === 'collectionList')!, blocks) as { properties: Record<string, { properties?: object }> }
    assert.deepEqual(Object.keys(schema.properties.partClassName?.properties ?? {}), ['empty', 'pager', 'pageLink'])
  })
})
