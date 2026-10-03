import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { collectClasses } from './classes'
import { createId } from './ids'
import { findBlock, findLocation, isSelfOrDescendant, normalizeLayout, walkBlocks } from './tree'
import type { Layout } from './types'

const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', props: { text: 'Hi' }, className: 'text-3xl  font-bold' },
    {
      id: 's',
      type: 'stack',
      className: 'flex\tgap-4 text-3xl',
      slots: {
        children: [{ id: 'a', type: 'text', hidden: true, className: 'hidden md:block' }],
        aside: [{ id: 'b', type: 'stack', slots: { children: [{ id: 'c', type: 'text' }] } }],
      },
    },
  ],
}

describe('createId', () => {
  it('makes short, unique ids', () => {
    const ids = new Set(Array.from({ length: 2000 }, createId))
    assert.equal(ids.size, 2000)
    for (const id of ids) assert.match(id, /^b_[0-9a-z]{6}$/)
  })
})

describe('tree', () => {
  it('finds blocks and locations at any depth', () => {
    assert.equal(findBlock(layout, 'c')?.type, 'text')
    assert.equal(findBlock(layout, 'nope'), null)
    assert.deepEqual(findLocation(layout, 'h'), { parentId: null, slot: 'children', index: 0, depth: 0 })
    assert.deepEqual(findLocation(layout, 'b'), { parentId: 's', slot: 'aside', index: 0, depth: 1 })
    assert.deepEqual(findLocation(layout, 'c'), { parentId: 'b', slot: 'children', index: 0, depth: 2 })
    assert.equal(findLocation(layout, 'nope'), null)
  })

  it('walks depth first and can skip children', () => {
    const all: string[] = []
    walkBlocks(layout, (block) => {
      all.push(block.id)
    })
    assert.deepEqual(all, ['h', 's', 'a', 'b', 'c'])
    const skipped: string[] = []
    walkBlocks(layout, (block) => {
      skipped.push(block.id)
      if (block.id === 'b') return false
    })
    assert.deepEqual(skipped, ['h', 's', 'a', 'b'])
  })

  it('isSelfOrDescendant', () => {
    assert.equal(isSelfOrDescendant(layout, 's', 's'), true)
    assert.equal(isSelfOrDescendant(layout, 's', 'c'), true)
    assert.equal(isSelfOrDescendant(layout, 'b', 'a'), false)
    assert.equal(isSelfOrDescendant(layout, 's', null), false)
    assert.equal(isSelfOrDescendant(layout, 'nope', 'c'), false)
  })

  it('collectClasses splits, dedupes, sorts and includes hidden blocks', () => {
    assert.deepEqual(collectClasses(layout), ['flex', 'font-bold', 'gap-4', 'hidden', 'md:block', 'text-3xl'])
    assert.deepEqual(collectClasses({ version: 1, blocks: [] }), [])
  })
})

describe('normalizeLayout', () => {
  it('turns empty and garbage values into an empty layout', () => {
    for (const value of [null, undefined, '', 'not json', 42, true, {}, { blocks: 'x' }, [1, 2], () => 1]) {
      assert.deepStrictEqual(normalizeLayout(value), { version: 1, blocks: [] })
    }
  })

  it('keeps a valid layout as is', () => {
    assert.deepStrictEqual(normalizeLayout(layout), layout)
  })

  it('parses JSON strings and bare block arrays', () => {
    assert.deepStrictEqual(normalizeLayout(JSON.stringify(layout)), layout)
    assert.deepStrictEqual(normalizeLayout(layout.blocks), layout)
  })

  it('drops invalid blocks and invalid parts of blocks', () => {
    const result = normalizeLayout({
      version: 7,
      blocks: [
        null,
        'x',
        { id: 'no-type' },
        { id: 'a', type: '' },
        {
          id: 'b',
          type: 'stack',
          props: [],
          className: 5,
          hidden: 'yes',
          bindings: { text: 'title', bad: 3, empty: '' },
          slots: { children: [{ type: 'text' }, 7], aside: 'nope', empty: [] },
        },
      ],
    })
    assert.equal(result.blocks.length, 1)
    const block = result.blocks[0]
    assert.equal(block.id, 'b')
    assert.equal(block.props, undefined)
    assert.equal(block.className, undefined)
    assert.equal(block.hidden, undefined)
    assert.deepEqual(block.bindings, { text: 'title' })
    assert.deepEqual(Object.keys(block.slots ?? {}), ['children'])
    assert.match(block.slots?.children[0].id ?? '', /^b_/)
  })

  it('regenerates missing and duplicate ids', () => {
    const result = normalizeLayout({
      version: 1,
      blocks: [
        { id: 'x', type: 'text' },
        { id: 'x', type: 'text' },
        { type: 'text' },
        { id: 12, type: 'text' },
      ],
    })
    const ids = result.blocks.map((b) => b.id)
    assert.equal(ids[0], 'x')
    assert.notEqual(ids[1], 'x')
    assert.equal(ids[3], '12')
    assert.equal(new Set(ids).size, 4)
  })

  it('strips empty props, slots and bindings, and hidden: false', () => {
    const result = normalizeLayout({
      version: 1,
      blocks: [{ id: 'a', type: 'stack', props: {}, slots: { children: [] }, bindings: {}, hidden: false, className: ' ' }],
    })
    assert.deepStrictEqual(result.blocks[0], { id: 'a', type: 'stack' })
  })

  it('reads old shapes: Payload blocks rows and `children` arrays', () => {
    const result = normalizeLayout([
      { id: 'r1', blockType: 'heading', blockName: 'Hero', text: 'Hello', level: '2' },
      { id: 'r2', type: 'stack', children: [{ id: 'r3', type: 'text' }] },
    ])
    assert.deepStrictEqual(result.blocks[0], { id: 'r1', type: 'heading', props: { text: 'Hello', level: '2' } })
    assert.deepEqual(result.blocks[1].slots?.children.map((b) => b.id), ['r3'])
  })
})
