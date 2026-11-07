import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, CanvasMeasurement, Layout } from '../../../core/types'
import { insertSpotAt, sameSpot, spotPosition, tooSmallForInsert } from './spots'
import type { Rect } from '../../../core/types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'row', label: 'Row', fields: [], slots: { children: {} } },
  { type: 'only', label: 'Locked', fields: [], slots: { children: { allow: ['nothing'] } } },
  { type: 'heading', label: 'Heading', fields: [] },
  { type: 'text', label: 'Text', fields: [] },
]

// Root (vertical): heading h, stack s (a, b with a 30 px gap), empty stack e, row r (x, y side by side), locked l (t).
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading' },
    { id: 's', type: 'stack', slots: { children: [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }] } },
    { id: 'e', type: 'stack' },
    { id: 'r', type: 'row', slots: { children: [{ id: 'x', type: 'text' }, { id: 'y', type: 'text' }] } },
    { id: 'l', type: 'only', slots: { children: [{ id: 't', type: 'text' }] } },
  ],
}

const m: CanvasMeasurement = {
  blocks: [
    { id: 'h', rect: { x: 0, y: 0, width: 400, height: 50 } },
    { id: 's', rect: { x: 0, y: 50, width: 400, height: 200 } },
    { id: 'a', rect: { x: 20, y: 70, width: 360, height: 60 } },
    { id: 'b', rect: { x: 20, y: 160, width: 360, height: 60 } },
    { id: 'e', rect: { x: 0, y: 250, width: 400, height: 100 } },
    { id: 'r', rect: { x: 0, y: 350, width: 400, height: 100 } },
    { id: 'x', rect: { x: 20, y: 370, width: 160, height: 60 } },
    { id: 'y', rect: { x: 220, y: 370, width: 160, height: 60 } },
    { id: 'l', rect: { x: 0, y: 450, width: 400, height: 100 } },
    { id: 't', rect: { x: 20, y: 470, width: 360, height: 60 } },
  ],
  slots: [
    { ownerId: 's', slot: 'children', rect: { x: 0, y: 50, width: 400, height: 200 }, axis: 'y', empty: false },
    { ownerId: 'e', slot: 'children', rect: { x: 10, y: 260, width: 380, height: 80 }, axis: 'y', empty: true },
    { ownerId: 'r', slot: 'children', rect: { x: 0, y: 350, width: 400, height: 100 }, axis: 'x', empty: false },
    { ownerId: 'l', slot: 'children', rect: { x: 0, y: 450, width: 400, height: 100 }, axis: 'y', empty: false },
  ],
  rootAxis: 'y',
  viewport: { width: 400, height: 800 },
  scroll: { x: 0, y: 0 },
  documentHeight: 550,
}

describe('insertSpotAt', () => {
  it('puts the spot before or after a leaf, by the pointer side', () => {
    const before = insertSpotAt(layout, blocks, m, { x: 100, y: 80 })
    assert.deepEqual(before && spotPosition(before), { parentId: 's', slot: 'children', index: 0 })
    assert.equal(before?.kind, 'between')
    assert.equal(before?.at.y, 70)
    const after = insertSpotAt(layout, blocks, m, { x: 100, y: 125 })
    assert.deepEqual(after && spotPosition(after), { parentId: 's', slot: 'children', index: 1 })
  })

  it('centers the button in the gap between two blocks', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 100, y: 125 })
    // a ends at 130, b starts at 160.
    assert.equal(spot?.at.y, 145)
    assert.equal(spot?.at.x, 200)
    assert.equal(spot?.rect.width, 360)
  })

  it('uses the gap between children when the pointer is in it', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 100, y: 150 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: 's', slot: 'children', index: 1 })
    assert.equal(spot?.at.y, 145)
    const last = insertSpotAt(layout, blocks, m, { x: 100, y: 235 })
    assert.deepEqual(last && spotPosition(last), { parentId: 's', slot: 'children', index: 2 })
  })

  it('puts the spot around a container near its edge', () => {
    const top = insertSpotAt(layout, blocks, m, { x: 100, y: 53 })
    assert.deepEqual(top && spotPosition(top), { parentId: null, slot: 'children', index: 1 })
    assert.equal(top?.at.y, 50)
    const bottom = insertSpotAt(layout, blocks, m, { x: 100, y: 247 })
    assert.deepEqual(bottom && spotPosition(bottom), { parentId: null, slot: 'children', index: 2 })
  })

  it('goes inside an empty slot', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 200, y: 300 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: 'e', slot: 'children', index: 0 })
    assert.equal(spot?.kind, 'empty')
    assert.deepEqual(spot?.at, { x: 200, y: 300 })
  })

  it('follows a horizontal list: left or right of a block', () => {
    const left = insertSpotAt(layout, blocks, m, { x: 40, y: 400 })
    assert.deepEqual(left && spotPosition(left), { parentId: 'r', slot: 'children', index: 0 })
    assert.equal(left?.axis, 'x')
    assert.equal(left?.at.x, 20)
    const right = insertSpotAt(layout, blocks, m, { x: 170, y: 400 })
    assert.deepEqual(right && spotPosition(right), { parentId: 'r', slot: 'children', index: 1 })
    // x ends at 180, y starts at 220.
    assert.equal(right?.at.x, 200)
  })

  it('moves up to the parent when the slot accepts no block type', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 100, y: 480 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: null, slot: 'children', index: 4 })
  })

  it('offers the root list below the last block and on an empty page', () => {
    const below = insertSpotAt(layout, blocks, m, { x: 100, y: 700 })
    assert.deepEqual(below && spotPosition(below), { parentId: null, slot: 'children', index: 5 })
    const empty = insertSpotAt({ version: 1, blocks: [] }, blocks, m, { x: 10, y: 10 })
    assert.equal(empty?.kind, 'empty')
    assert.deepEqual(empty && spotPosition(empty), { parentId: null, slot: 'children', index: 0 })
  })

  it("offers no spot on the selected block's own edge, but its neighbour's edge still does", () => {
    const selected = { id: 'h', tolerance: 4 }
    // The lower half of h: after h, on its bottom edge (s touches it).
    assert.equal(insertSpotAt(layout, blocks, m, { x: 100, y: 45 }, { selected }), null)
    // The same place from s's top edge band: offered.
    const fromNeighbour = insertSpotAt(layout, blocks, m, { x: 100, y: 53 }, { selected })
    assert.deepEqual(fromNeighbour && spotPosition(fromNeighbour), { parentId: null, slot: 'children', index: 1 })
    // a is selected: its top edge (no block above it in s) offers nothing, not the edge of s either.
    const child = { id: 'a', tolerance: 4 }
    assert.equal(insertSpotAt(layout, blocks, m, { x: 100, y: 80 }, { selected: child }), null)
    // A gap wider than the tolerance keeps its spot in the middle.
    const gap = insertSpotAt(layout, blocks, m, { x: 100, y: 125 }, { selected: child })
    assert.equal(gap?.at.y, 145)
    // In a row, the left and right edges count.
    assert.equal(insertSpotAt(layout, blocks, m, { x: 40, y: 400 }, { selected: { id: 'x', tolerance: 4 } }), null)
  })

  it('compares spots by position and place', () => {
    const a = insertSpotAt(layout, blocks, m, { x: 100, y: 125 })
    const b = insertSpotAt(layout, blocks, m, { x: 120, y: 128 })
    assert.equal(sameSpot(a, b), true)
    assert.equal(sameSpot(a, insertSpotAt(layout, blocks, m, { x: 100, y: 80 })), false)
    assert.equal(sameSpot(null, null), true)
    assert.equal(sameSpot(a, null), false)
  })
})

const icon = (x: number, y: number): Rect => ({ x, y, width: 24, height: 24 })

describe('the "+" and small blocks', () => {
  it('tooSmallForInsert: short along the axis and not wide across it', () => {
    // An icon in a row, or stacked.
    assert.equal(tooSmallForInsert({ x: 0, y: 0, width: 24, height: 24 }, 'x'), true)
    assert.equal(tooSmallForInsert({ x: 0, y: 0, width: 24, height: 24 }, 'y'), true)
    // A one-line text across a column keeps its "+" above and below.
    assert.equal(tooSmallForInsert({ x: 0, y: 0, width: 360, height: 24 }, 'y'), false)
    // A button in a row: wide enough along the row.
    assert.equal(tooSmallForInsert({ x: 0, y: 0, width: 120, height: 40 }, 'x'), false)
    // Zoomed out to 50 %: the button is 40 iframe pixels, so a 60 px block is small.
    assert.equal(tooSmallForInsert({ x: 0, y: 0, width: 60, height: 60 }, 'x', 40), true)
  })

  // Root: a heading, a row of three 24 px icons (8 px apart), and a feature row whose first item
  // is an icon followed by a label 4 px after it.
  const smallLayout: Layout = {
    version: 1,
    blocks: [
      { id: 'h', type: 'heading' },
      { id: 'icons', type: 'row', slots: { children: [{ id: 'i1', type: 'text' }, { id: 'i2', type: 'text' }, { id: 'i3', type: 'text' }] } },
      { id: 'f', type: 'row', slots: { children: [{ id: 'fi', type: 'text' }, { id: 'fl', type: 'text' }] } },
    ],
  }
  const sm: CanvasMeasurement = {
    blocks: [
      { id: 'h', rect: { x: 0, y: 0, width: 400, height: 60 } },
      { id: 'icons', rect: { x: 0, y: 100, width: 400, height: 24 } },
      { id: 'i1', rect: icon(0, 100) },
      { id: 'i2', rect: icon(32, 100) },
      { id: 'i3', rect: icon(64, 100) },
      { id: 'f', rect: { x: 0, y: 200, width: 400, height: 28 } },
      { id: 'fi', rect: icon(0, 202) },
      { id: 'fl', rect: { x: 28, y: 200, width: 80, height: 28 } },
    ],
    slots: [
      { ownerId: 'icons', slot: 'children', rect: { x: 0, y: 100, width: 400, height: 24 }, axis: 'x', empty: false },
      { ownerId: 'f', slot: 'children', rect: { x: 0, y: 200, width: 400, height: 28 }, axis: 'x', empty: false },
    ],
    rootAxis: 'y',
    viewport: { width: 400, height: 800 },
    scroll: { x: 0, y: 0 },
    documentHeight: 300,
  }
  const icons = sm.blocks.filter((b) => b.id.startsWith('i') && b.id !== 'icons').map((b) => b.rect)
  // More than a fifth of an icon under the 20 px button.
  const coversAnIcon = (at: { x: number; y: number }) =>
    [...icons, icon(0, 202)].some((r) => {
      const w = Math.min(at.x + 10, r.x + r.width) - Math.max(at.x - 10, r.x)
      const h = Math.min(at.y + 10, r.y + r.height) - Math.max(at.y - 10, r.y)
      return w > 0 && h > 0 && (w * h) / (r.width * r.height) > 0.2
    })

  it('offers no "+" beside an icon in a row; the row itself takes it, clear of the icons', () => {
    for (const p of [
      { x: 4, y: 112 },
      { x: 30, y: 112 },
      { x: 44, y: 112 },
      { x: 86, y: 112 },
    ]) {
      const spot = insertSpotAt(smallLayout, blocks, sm, p)
      assert.notEqual(spot?.parentId, 'icons', `no spot inside the row at ${p.x}`)
      if (spot) assert.equal(coversAnIcon(spot.at), false, `the "+" lies over no icon at ${p.x}`)
    }
    // The pointer in the lower half of the row: after the row, on its bottom edge.
    const after = insertSpotAt(smallLayout, blocks, sm, { x: 44, y: 120 })
    assert.deepEqual(after && spotPosition(after), { parentId: null, slot: 'children', index: 2 })
  })

  it('never puts the "+" over a small block, even beside a large one', () => {
    // Left half of the label: the spot between the icon and the label would cover the icon.
    const spot = insertSpotAt(smallLayout, blocks, sm, { x: 40, y: 214 })
    assert.notDeepEqual(spot && spotPosition(spot), { parentId: 'f', slot: 'children', index: 1 })
    if (spot) assert.equal(coversAnIcon(spot.at), false)
    // Right half of the label: after it, far from the icon.
    const right = insertSpotAt(smallLayout, blocks, sm, { x: 100, y: 214 })
    assert.deepEqual(right && spotPosition(right), { parentId: 'f', slot: 'children', index: 2 })
  })

  it('keeps the "+" between normal blocks', () => {
    const spot = insertSpotAt(smallLayout, blocks, sm, { x: 200, y: 50 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: null, slot: 'children', index: 1 })
  })
})
