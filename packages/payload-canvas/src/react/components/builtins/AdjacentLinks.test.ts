import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { builtinBlocks, defaultBlocks } from '../../../blocks'
import type { Block, Layout } from '../../../core/types'
import { listQueries } from '../../render/lists'
import { RenderLayout } from '../../render/RenderLayout'
import { builtinComponents } from '.'

const blocks = [...defaultBlocks(), ...builtinBlocks()]
const components = builtinComponents({ labels: { adjacentLinks: { label: 'Weitere Beiträge' } } })

/** One side: a collection list whose item is a heading bound to the title. `docs`: what `loadLayoutData` found. */
const side = (id: string, docs?: Array<Record<string, unknown>>): Block => ({
  id,
  type: 'collectionList',
  props: { collection: 'posts', limit: 1, ...(docs ? { $items: docs } : {}) },
  slots: { item: [{ id: `${id}_title`, type: 'heading', props: { level: '3' }, bindings: { text: 'title' } }] },
})

function render(previous: Array<Record<string, unknown>>, next: Array<Record<string, unknown>>, mode: 'site' | 'canvas' = 'site', props?: Record<string, unknown>) {
  const layout: Layout = {
    version: 1,
    blocks: [{ id: 'a', type: 'adjacentLinks', ...(props ? { props } : {}), partClassName: { next: 'ms-auto' }, slots: { previous: [side('p', previous)], next: [side('n', next)] } }],
  }
  return renderToStaticMarkup(createElement(RenderLayout, { layout, blocks, components, mode }))
}

describe('AdjacentLinks', () => {
  it('renders a named nav with the document on each side', () => {
    const html = render([{ id: 1, title: 'Older post' }], [{ id: 3, title: 'Newer post' }])
    assert.equal(
      html,
      '<nav aria-label="Weitere Beiträge"><div><div><h3>Older post</h3></div></div><div class="ms-auto builder-css"><div><h3>Newer post</h3></div></div></nav>',
    )
    assert.match(render([{ id: 1, title: 'Older' }], [], 'site', { label: 'More posts' }), /^<nav aria-label="More posts">/)
  })

  it('on the site leaves out a side without a document, and the whole block when both are empty', () => {
    assert.equal(render([], [{ id: 3, title: 'Newer post' }]), '<nav aria-label="Weitere Beiträge"><div class="ms-auto builder-css"><div><h3>Newer post</h3></div></div></nav>')
    assert.equal(render([{ id: 1, title: 'Older post' }], []), '<nav aria-label="Weitere Beiträge"><div><div><h3>Older post</h3></div></div></nav>')
    assert.equal(render([], []), '')
  })

  it('the collection lists of its example load the documents before and after the page (no new loading code)', () => {
    const example = builtinBlocks().find((def) => def.type === 'adjacentLinks')!.ai!.example!
    const layout: Layout = { version: 1, blocks: [{ id: 'a', ...example, type: 'adjacentLinks' }] }
    const context = { collection: 'posts', doc: { id: 2, publishedAt: '2024-05-01T00:00:00.000Z' } }
    const queries = listQueries(layout, context).map(({ blockId: _blockId, ...query }) => query)
    assert.deepEqual(queries, [
      { collection: 'posts', limit: 1, sort: '-publishedAt', exclude: 2, where: { publishedAt: { less_than: '2024-05-01T00:00:00.000Z' } } },
      { collection: 'posts', limit: 1, sort: 'publishedAt', exclude: 2, where: { publishedAt: { greater_than: '2024-05-01T00:00:00.000Z' } } },
    ])
    // Without a page document (a normal page), the lists find nothing.
    assert.ok(listQueries(layout, null).every((query) => query.none))
  })

  it('the canvas always shows both sides, so each can be edited', () => {
    const html = render([], [], 'canvas')
    assert.match(html, /<nav data-block-id="a" data-block-type="adjacentLinks" aria-label="Weitere Beiträge">/)
    assert.match(html, /data-slot-owner="a" data-slot="previous"/)
    assert.match(html, /data-slot-owner="a" data-slot="next"/)
  })
})
