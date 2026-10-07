import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { defaultBlocks } from '../../../blocks'
import type { BlockDefinition, Layout } from '../../../core'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { RenderLayout } from '../../render/RenderLayout'
import { bindingFor, fieldAtPath, inlineKind, readText, singleLine, valueAtPath, withPropValue, type TextNodeLike } from './model'

const blocks = defaultBlocks()
const def = (type: string) => blocks.find((b) => b.type === type)

describe('inlineKind', () => {
  test('text fields are one line, textareas several, richText is rich', () => {
    assert.equal(inlineKind(def('heading'), 'text', 'Hi'), 'line')
    assert.equal(inlineKind(def('text'), 'text', 'Hi'), 'lines')
    assert.equal(inlineKind(def('richText'), 'content', null), 'rich')
    assert.equal(inlineKind(def('button'), 'label', 'Go'), 'line')
    assert.equal(inlineKind(def('quote'), 'quote', 'Q'), 'lines')
    assert.equal(inlineKind(def('quote'), 'cite', 'C'), 'line')
  })

  test('array rows: the number segment steps into the row fields', () => {
    assert.equal(inlineKind(def('menu'), 'items.2.label', 'x'), 'line')
    assert.equal(fieldAtPath(def('menu')?.fields, 'items.x.label'), null)
    assert.equal(inlineKind(def('listItem'), 'text', 'x'), 'line')
  })

  test('other field types and unknown paths cannot be edited inline', () => {
    assert.equal(inlineKind(def('heading'), 'level', '2'), null)
    assert.equal(inlineKind(def('heading'), 'nope', 'x'), null)
    assert.equal(inlineKind(undefined, 'title', 'x'), 'line')
    assert.equal(inlineKind(undefined, 'count', 3), null)
  })

  test('fields inside rows, collapsibles, unnamed groups and tabs are found', () => {
    const definition: BlockDefinition = {
      type: 'card',
      label: 'Card',
      fields: [
        { type: 'row', fields: [{ name: 'title', type: 'text' }] },
        { type: 'tabs', tabs: [{ label: 'A', fields: [{ name: 'body', type: 'textarea' }] }, { name: 'meta', label: 'B', fields: [{ name: 'note', type: 'text' }] }] },
      ],
    }
    assert.equal(inlineKind(definition, 'title', ''), 'line')
    assert.equal(inlineKind(definition, 'body', ''), 'lines')
    assert.equal(inlineKind(definition, 'meta.note', ''), 'line')
  })
})

test('valueAtPath reads nested rows', () => {
  const props = { items: [{ text: 'a' }, { text: 'b' }] }
  assert.equal(valueAtPath(props, 'items.1.text'), 'b')
  assert.equal(valueAtPath(props, 'items.5.text'), undefined)
  assert.equal(valueAtPath(undefined, 'text'), undefined)
})

test('bindingFor covers the prop and the rows under a bound array', () => {
  assert.equal(bindingFor({ bindings: { text: 'title' } }, 'text'), 'title')
  assert.equal(bindingFor({ bindings: { items: 'tags' } }, 'items.1.text'), 'tags')
  assert.equal(bindingFor({ bindings: { label: 'title' } }, 'text'), null)
  assert.equal(bindingFor({}, 'text'), null)
})

describe('withPropValue', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'a', type: 'stack', slots: { children: [{ id: 'b', type: 'heading', props: { text: 'New', level: '2' } }] } },
      { id: 'c', type: 'text', props: { text: 'Other' } },
    ],
  }

  test('replaces one prop of a nested block and keeps the other blocks', () => {
    const next = withPropValue(layout, 'b', 'text', 'Old')
    assert.deepEqual(next.blocks[0].slots?.children[0].props, { text: 'Old', level: '2' })
    assert.equal(next.blocks[1], layout.blocks[1])
    assert.equal(layout.blocks[0].slots?.children[0].props?.text, 'New')
  })

  test('returns the same layout when the block is gone', () => {
    assert.equal(withPropValue(layout, 'zzz', 'text', 'x'), layout)
  })
})

/** A tiny DOM stand-in for readText. */
const text = (value: string): TextNodeLike => ({ nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] })
const el = (name: string, ...children: TextNodeLike[]): TextNodeLike => ({ nodeType: 1, nodeName: name, nodeValue: null, childNodes: children })

describe('readText', () => {
  test('line breaks come from <br> and from lines the browser wrapped in div or p', () => {
    assert.equal(readText(el('P', text('One'), el('BR'), text('Two')), true), 'One\nTwo')
    assert.equal(readText(el('P', text('One'), el('DIV', text('Two'))), true), 'One\nTwo')
  })

  test('a trailing <br> only shows an empty last line and is dropped', () => {
    assert.equal(readText(el('P', text('One'), el('BR')), true), 'One')
    assert.equal(readText(el('P', text('One'), el('BR'), el('BR')), true), 'One\n')
  })

  test('non-breaking spaces become spaces; one-line props join lines with a space', () => {
    assert.equal(readText(el('H2', text('A B')), false), 'A B')
    assert.equal(readText(el('H2', text('One'), el('BR'), text('Two')), false), 'One Two')
    assert.equal(singleLine('a \n b\r\nc'), 'a b c')
  })

  test('an empty element is empty text', () => {
    assert.equal(readText(el('H2'), false), '')
    assert.equal(readText(el('H2', el('BR')), false), '')
  })
})

describe('editable text marks', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'h', type: 'heading', props: { text: 'Hello', level: '2' } },
      { id: 'l', type: 'list', props: { items: [{ id: 'r1', text: '' }, { id: 'r2', text: 'Second' }] } },
      { id: 'm', type: 'list', slots: { items: [{ id: 'i1', type: 'listItem', props: { text: 'Item' } }] } },
      { id: 'q', type: 'quote', props: { quote: 'Q', cite: 'C' } },
    ],
  }
  const render = (mode: 'site' | 'canvas') => renderToStaticMarkup(createElement(RenderLayout, { layout, blocks, mode }))

  test('the canvas marks each text prop element with its path; list rows keep their stored index', () => {
    const html = render('canvas')
    assert.match(html, /<h2 data-block-id="h"[^>]*data-builder-text="text"/)
    assert.match(html, /<li data-builder-text="items.1.text">Second<\/li>/)
    assert.match(html, /<li data-block-id="i1" data-block-type="listItem" data-builder-text="text">Item<\/li>/)
    assert.match(html, /<p data-builder-text="quote">Q<\/p>/)
    assert.match(html, /<cite data-builder-text="cite">C<\/cite>/)
  })

  test('the site output has no editor marks', () => {
    assert.doesNotMatch(render('site'), /data-builder/)
  })
})
