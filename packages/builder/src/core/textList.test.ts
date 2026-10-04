import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import { placementError, starterSlots } from './blocks'
import { canvasDropTarget } from './dropTarget'
import { applyOperations } from './operations'
import { layoutJsonSchema } from './schema'
import { joinListItem, splitListItem } from './textList'
import { normalizeLayout } from './tree'
import type { Block, CanvasMeasurement, Layout } from './types'
import { validateLayout } from './validate'

const blocks = defaultBlocks()
const item = (id: string, text?: string, className?: string): Block => ({
  id,
  type: 'listItem',
  ...(text ? { props: { text } } : {}),
  ...(className ? { className } : {}),
})
const listLayout = (...items: Block[]): Layout => ({
  version: 1,
  blocks: [{ id: 'l', type: 'list', className: 'pl-6', slots: { items } }],
})

describe('old list data (props.items rows)', () => {
  it('becomes listItem blocks in the items slot on load', () => {
    const layout = normalizeLayout({
      version: 1,
      blocks: [{ id: 'l', type: 'list', props: { ordered: true, items: [{ id: 'r1', text: 'One' }, { text: '' }, { text: 'Two' }, 'bad'] } }],
    })
    const list = layout.blocks[0]
    assert.deepEqual(list.props, { ordered: true })
    assert.equal(list.slots?.items?.length, 2)
    assert.deepEqual(list.slots?.items?.[0], { id: 'r1', type: 'listItem', props: { text: 'One' } })
    assert.equal(list.slots?.items?.[1].props?.text, 'Two')
    assert.ok(list.slots?.items?.[1].id)
    assert.deepEqual(validateLayout(layout, blocks), [])
  })

  it('drops the empty props object, and never reuses a taken id', () => {
    const layout = normalizeLayout([{ id: 'r1', type: 'text' }, { id: 'l', type: 'list', props: { items: [{ id: 'r1', text: 'One' }] } }])
    assert.equal(layout.blocks[1].props, undefined)
    assert.notEqual(layout.blocks[1].slots?.items?.[0].id, 'r1')
  })

  it('keeps existing items, and keeps the old form when a binding feeds it', () => {
    const both = normalizeLayout([{ id: 'l', type: 'list', props: { items: [{ text: 'Old' }] }, slots: { items: [item('i', 'New')] } }])
    assert.deepEqual(both.blocks[0].slots?.items?.map((b) => b.props?.text), ['New'])
    assert.equal(both.blocks[0].props, undefined)
    const bound = normalizeLayout([{ id: 'l', type: 'list', props: { items: [{ text: 'A' }] }, bindings: { items: 'tags' } }])
    assert.deepEqual(bound.blocks[0].props, { items: [{ text: 'A' }] })
    assert.equal(bound.blocks[0].slots, undefined)
  })

  it('is stable: a converted layout normalizes to itself', () => {
    const once = normalizeLayout([{ id: 'l', type: 'list', props: { items: [{ id: 'a', text: 'A' }] } }])
    assert.deepEqual(normalizeLayout(once), once)
  })
})

describe('listItem placement', () => {
  const layout: Layout = {
    version: 1,
    blocks: [{ id: 's', type: 'stack' }, { id: 'l', type: 'list', slots: { items: [item('i1', 'One')] } }],
  }

  it('goes only inside a list', () => {
    assert.equal(placementError(blocks, layout, 'l', 'items', 'listItem'), null)
    assert.equal(placementError(blocks, layout, 's', 'children', 'listItem'), 'List item can only go inside List')
    assert.equal(placementError(blocks, layout, null, 'children', 'listItem'), 'List item can only go inside List')
    assert.equal(placementError(blocks, layout, 'l', 'items', 'text'), 'Text cannot go inside List')
  })

  it('the operations refuse a list item outside a list', () => {
    const result = applyOperations(layout, [{ type: 'move', id: 'i1', to: { parentId: 's', index: 0 } }], { blocks })
    assert.equal(result.ok, false)
  })

  it('validation reports a list item outside a list', () => {
    const errors = validateLayout({ version: 1, blocks: [item('x', 'Loose')] }, blocks)
    assert.deepEqual(errors.map((e) => [e.code, e.message]), [['nesting', 'List item can only go inside List']])
  })

  it('the canvas never drops a list item on the root list', () => {
    const measurement: CanvasMeasurement = {
      blocks: [{ id: 'l', rect: { x: 0, y: 0, width: 100, height: 40 } }, { id: 'i1', rect: { x: 0, y: 0, width: 100, height: 20 } }],
      slots: [{ ownerId: 'l', slot: 'items', rect: { x: 0, y: 0, width: 100, height: 40 }, axis: 'y', empty: false }],
      rootAxis: 'y',
      viewport: { width: 100, height: 400 },
      scroll: { x: 0, y: 0 },
      documentHeight: 400,
    }
    const outside = canvasDropTarget(layout, blocks, measurement, { x: 50, y: 300 }, { kind: 'new', blockType: 'listItem' })
    assert.equal(outside, null)
    const inside = canvasDropTarget(layout, blocks, measurement, { x: 50, y: 18 }, { kind: 'new', blockType: 'listItem' })
    assert.equal(inside?.to.parentId, 'l')
  })

  it('the layout schema keeps list items out of the root and other slots', () => {
    const schema = layoutJsonSchema(blocks) as { properties: { blocks: { items: { oneOf: { $ref: string }[] } } }; $defs: Record<string, { properties: { slots?: { properties: Record<string, { description: string }> } } }> }
    assert.ok(!schema.properties.blocks.items.oneOf.some((r) => r.$ref.endsWith('/listItem')))
    assert.match(schema.$defs.list.properties.slots?.properties.items.description ?? '', /Accepts: listItem\./)
    assert.doesNotMatch(schema.$defs.stack.properties.slots?.properties.children.description ?? '', /listItem/)
  })

  it('a new list starts with one empty list item', () => {
    let n = 0
    assert.deepEqual(starterSlots(blocks, 'list', () => `n${++n}`), { items: [{ id: 'n1', type: 'listItem' }] })
    assert.equal(starterSlots(blocks, 'stack', () => 'x'), null)
  })
})

describe('Enter and Backspace in list items', () => {
  it('Enter adds an item with the text after the caret, with the same classes', () => {
    const layout = listLayout(item('a', 'One', 'font-bold'), item('b', 'Two'))
    const edit = splitListItem(layout, 'a', 'tail', 'new')
    assert.deepEqual(edit, {
      ops: [{ type: 'insert', block: { id: 'new', type: 'listItem', props: { text: 'tail' }, className: 'font-bold' }, to: { parentId: 'l', slot: 'items', index: 1 } }],
      editId: 'new',
      offset: 0,
    })
    const result = applyOperations(layout, edit?.ops ?? [], { blocks })
    assert.ok(result.ok)
    assert.deepEqual(result.layout.blocks[0].slots?.items?.map((b) => b.id), ['a', 'new', 'b'])
    assert.deepEqual(splitListItem(layout, 'b', '', 'c')?.ops[0], { type: 'insert', block: { id: 'c', type: 'listItem' }, to: { parentId: 'l', slot: 'items', index: 2 } })
  })

  it('Backspace at the start joins the item to the one before, caret where they meet', () => {
    const layout = listLayout(item('a', 'One'), item('b', 'Two'), item('c'))
    const edit = joinListItem(layout, 'b', 'Two')
    assert.deepEqual(edit, {
      ops: [{ type: 'update', id: 'a', props: { text: 'OneTwo' } }, { type: 'remove', id: 'b' }],
      editId: 'a',
      offset: 3,
    })
    assert.deepEqual(joinListItem(layout, 'c', '')?.ops, [{ type: 'remove', id: 'c' }])
    const result = applyOperations(layout, edit?.ops ?? [])
    assert.ok(result.ok)
    assert.deepEqual(result.layout.blocks[0].slots?.items?.map((b) => [b.id, b.props?.text]), [['a', 'OneTwo'], ['c', undefined]])
  })

  it('the first item and other blocks do nothing', () => {
    const layout = listLayout(item('a', 'One'))
    assert.equal(joinListItem(layout, 'a', 'One'), null)
    assert.equal(joinListItem(layout, 'l', ''), null)
    assert.equal(splitListItem(layout, 'l', '', 'x'), null)
    assert.equal(splitListItem(layout, 'missing', '', 'x'), null)
  })
})
