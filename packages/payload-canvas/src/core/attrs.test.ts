import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { defaultBlocks } from '../blocks'
import { sectionInsertOps } from '../mcp/shared'
import { RenderLayout } from '../react'
import { checkAttrs, htmlAttributes, withoutTakenHtmlIds } from './attrs'
import { applyOperation, applyOperations } from './operations'
import { normalizeLayout } from './tree'
import type { Layout } from './types'
import { validateLayout } from './validate'

const blocks = defaultBlocks()
const layout = (): Layout => ({
  version: 1,
  blocks: [
    { id: 'a', type: 'stack', attrs: { id: 'contact', ariaLabel: 'Contact' }, slots: { children: [{ id: 'b', type: 'text', props: { text: 'Hi' } }] } },
  ],
})

describe('block attrs', () => {
  it('checks and canonicalizes attrs', () => {
    assert.deepEqual(checkAttrs({ id: 'top', ariaLabel: '', ariaHidden: false }), { id: 'top' })
    assert.equal(checkAttrs({ ariaHidden: false }), undefined)
    assert.match(String(checkAttrs({ id: '1st' })), /starts with a letter/)
    assert.match(String(checkAttrs({ id: 'a b' })), /starts with a letter/)
    assert.match(String(checkAttrs({ role: 'x' })), /Unknown attrs key "role"/)
    assert.deepEqual(htmlAttributes({ id: 'x', ariaLabel: 'Menu', ariaHidden: true }), { id: 'x', 'aria-label': 'Menu', 'aria-hidden': 'true' })
  })
  it('update merges per key, null removes, and the inverse restores the block', () => {
    const before = layout()
    const result = applyOperation(before, { type: 'update', id: 'a', attrs: { ariaLabel: null, ariaHidden: true } })
    assert.ok(result.ok)
    assert.deepEqual(result.layout.blocks[0].attrs, { id: 'contact', ariaHidden: true })
    const undone = applyOperations(result.layout, result.inverse)
    assert.ok(undone.ok)
    assert.deepEqual(undone.layout, before)
    const cleared = applyOperation(before, { type: 'update', id: 'a', attrs: null })
    assert.ok(cleared.ok)
    assert.equal('attrs' in cleared.layout.blocks[0], false)
    const back = applyOperations(cleared.layout, cleared.inverse)
    assert.ok(back.ok)
    assert.deepEqual(back.layout, before)
  })
  it('refuses a repeated HTML id and a bad id', () => {
    const update = applyOperation(layout(), { type: 'update', id: 'b', attrs: { id: 'contact' } })
    assert.equal(update.ok, false)
    assert.match(update.ok ? '' : update.error, /already used by block "a"/)
    const insert = applyOperation(layout(), { type: 'insert', block: { id: 'c', type: 'text', attrs: { id: 'contact' } }, to: { parentId: null, index: 1 } })
    assert.equal(insert.ok, false)
    const bad = applyOperation(layout(), { type: 'update', id: 'b', attrs: { id: 'two words' } })
    assert.equal(bad.ok, false)
    // Setting a block's own id again is fine.
    assert.ok(applyOperation(layout(), { type: 'update', id: 'a', attrs: { id: 'contact' } }).ok)
  })
  it('a duplicate and a second section copy leave out the taken id', () => {
    const result = applyOperation(layout(), { type: 'duplicate', id: 'a', newId: 'a2' })
    assert.ok(result.ok)
    assert.deepEqual(result.layout.blocks[1].attrs, { ariaLabel: 'Contact' })
    const ops = sectionInsertOps(layout(), { id: 's', label: 'S', blocks: layout().blocks }, {})
    assert.ok(Array.isArray(ops))
    const insert = ops[0]
    assert.ok(insert.type === 'insert' && insert.block.attrs?.id === undefined)
    const block = layout().blocks[0]
    assert.equal(withoutTakenHtmlIds(block, new Set(['other'])), block)
  })
  it('normalizeLayout keeps valid attrs and drops bad keys; validateLayout flags a repeated id for publishing', () => {
    const normal = normalizeLayout({ blocks: [{ id: 'a', type: 'text', attrs: { id: '9', ariaLabel: 'Name', ariaHidden: 'yes' } }] })
    assert.deepEqual(normal.blocks[0].attrs, { ariaLabel: 'Name' })
    const twice: Layout = { version: 1, blocks: [{ id: 'a', type: 'text', attrs: { id: 'x' } }, { id: 'b', type: 'text', attrs: { id: 'x' } }] }
    const errors = validateLayout(twice, blocks).filter((e) => e.path.includes('attrs'))
    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'constraint')
    assert.equal(validateLayout({ version: 1, blocks: [{ id: 'a', type: 'text', props: { text: 'A' }, attrs: { id: 'x' } }] }, blocks).length, 0)
  })
  it('renders the attributes; rows after the first leave out the id', () => {
    const html = renderToStaticMarkup(createElement(RenderLayout, { layout: layout(), blocks }))
    assert.match(html, /^<div id="contact" aria-label="Contact"><p>Hi<\/p><\/div>$/)
    const repeat: Layout = {
      version: 1,
      blocks: [{ id: 'r', type: 'repeat', props: { path: 'tags' }, slots: { item: [{ id: 't', type: 'text', attrs: { id: 'tag', ariaHidden: true }, bindings: { text: '$item' } }] } }],
    }
    const rows = renderToStaticMarkup(createElement(RenderLayout, { layout: repeat, blocks, context: { collection: 'models', doc: { id: 1, tags: ['a', 'b'] } } }))
    assert.equal(rows.match(/id="tag"/g)?.length, 1)
    assert.equal(rows.match(/aria-hidden="true"/g)?.length, 2)
  })
})
