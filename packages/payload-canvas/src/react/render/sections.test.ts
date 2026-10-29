import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultBlocks, SECTION_REF_SLOT, sectionDetachOps, sectionRefBlock } from '../../blocks'
import { applyOperations, collectClasses, type Block, type Layout } from '../../core'
import { RenderLayout } from './RenderLayout'
import { attachSections } from './sections'
import type { FetchDocs } from './types'

// The plugin adds the sectionRef definition when saved sections are on.
const blocks = [...defaultBlocks(), sectionRefBlock()]
const saved: Record<string, unknown> = {
  id: 7,
  name: 'Call to action',
  blocks: [
    {
      id: 'cta',
      type: 'stack',
      className: 'flex gap-4',
      slots: {
        children: [
          { id: 'h', type: 'heading', props: { text: 'Book now', level: '2' } },
          // A ref inside a saved section stays empty: one level only.
          { id: 'inner', type: 'sectionRef', props: { section: 7 } },
        ],
      },
    },
  ],
}

type Calls = Array<[string, Array<string | number>]>

function fakeFetch(calls: Calls): FetchDocs {
  return async (collection, ids) => {
    calls.push([collection, ids])
    return new Map(ids.includes(7) ? [[7, saved]] : [])
  }
}

const page = (...refs: Block[]): Layout => ({ version: 1, blocks: [{ id: 'top', type: 'heading', props: { text: 'Hi' } }, ...refs] })
const ref = (id: string, section?: unknown): Block => ({ id, type: 'sectionRef', ...(section === undefined ? {} : { props: { section } }) })

describe('attachSections', () => {
  test('puts the section blocks, with prefixed ids, in the runtime slot, with one fetch', async () => {
    const calls: Calls = []
    const out = await attachSections(page(ref('r1', 7), ref('r2', '7')), blocks, fakeFetch(calls))
    assert.deepEqual(calls, [['builder-sections', [7, '7']]])
    const first = out.blocks[1]!.slots![SECTION_REF_SLOT]!
    assert.equal(first[0]!.id, 'r1_cta')
    assert.deepEqual(first[0]!.slots!.children!.map((b) => b.id), ['r1_h', 'r1_inner'])
    assert.equal(first[0]!.slots!.children![1]!.slots, undefined)
    assert.equal(out.blocks[2]!.slots![SECTION_REF_SLOT]![0]!.id, 'r2_cta')
  })

  test('leaves the layout alone without refs, without a sectionRef definition, or for a missing section', async () => {
    const calls: Calls = []
    const plain = page()
    assert.equal(await attachSections(plain, blocks, fakeFetch(calls)), plain)
    const one = page(ref('r', 7))
    assert.equal(await attachSections(one, defaultBlocks(), fakeFetch(calls)), one)
    assert.deepEqual(calls, [])
    const missing = await attachSections(page(ref('r', 99)), blocks, fakeFetch(calls))
    assert.equal(missing.blocks[1]!.slots, undefined)
  })

  test("a site's own list without the definition loads from the collection it is given", async () => {
    const calls: Calls = []
    const out = await attachSections(page(ref('r', 7)), defaultBlocks(), fakeFetch(calls), 'builder-sections')
    assert.equal(out.blocks[1]!.slots![SECTION_REF_SLOT]![0]!.id, 'r_cta')
    assert.equal(calls.length, 1)
  })
})

const render = (layout: Layout, mode: 'site' | 'canvas') =>
  // The sectionRef component is a default component: no components map needed.
  renderToStaticMarkup(createElement(RenderLayout, { layout, blocks, mode }))

describe('sectionRef rendering', () => {
  test('the site renders the section blocks with no element of its own', async () => {
    const layout = await attachSections(page(ref('r', 7)), blocks, fakeFetch([]))
    assert.equal(render(layout, 'site'), '<h2>Hi</h2><div class="flex gap-4 builder-css"><h2>Book now</h2></div>')
    assert.equal(render(page(ref('r', 7)), 'site'), '<h2>Hi</h2>')
    // compilePageCss of the loaded layout covers the section's classes.
    assert.ok(collectClasses(layout, blocks).includes('gap-4'))
  })

  test('the canvas selects the ref; the section blocks are repeats, not editable', async () => {
    const layout = await attachSections(page(ref('r', 7)), blocks, fakeFetch([]))
    const html = render(layout, 'canvas')
    assert.match(html, /<div data-block-id="r" data-block-type="sectionRef" style="display:contents"><div data-builder-repeat="" class="flex gap-4 builder-css">/)
    assert.doesNotMatch(html, /data-block-id="r_/)
    assert.doesNotMatch(html, /data-slot-owner="r"/)
    assert.match(render(page(ref('r')), 'canvas'), /data-block-id="r"[^>]*data-builder-placeholder=""[^>]*>Saved section: pick one/)
  })
})

describe('sectionDetachOps', () => {
  test('puts the copies where the ref was and removes the ref, as one batch', () => {
    const layout = page(ref('r', 7), { id: 'after', type: 'divider' })
    const copies: Block[] = [
      { id: 'c1', type: 'heading', props: { text: 'A' } },
      { id: 'c2', type: 'divider' },
    ]
    const result = applyOperations(layout, sectionDetachOps(layout, 'r', copies)!)
    assert.ok(result.ok)
    assert.deepEqual(result.layout.blocks.map((b) => b.id), ['top', 'c1', 'c2', 'after'])
    assert.equal(sectionDetachOps(layout, 'nope', copies), null)
    assert.equal(sectionDetachOps(layout, 'r', []), null)
  })
})
