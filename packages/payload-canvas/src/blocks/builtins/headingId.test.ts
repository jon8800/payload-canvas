import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { headingId, lexicalHeadings, lexicalText } from './headingId'

const heading = (tag: string, ...texts: string[]) => ({ type: 'heading', tag, children: texts.map((text) => ({ type: 'text', text })) })

describe('headingId', () => {
  it('makes a URL fragment from any script', () => {
    assert.equal(headingId('Who we are?'), 'who-we-are')
    assert.equal(headingId('  Über uns & mehr  '), 'uber-uns-mehr')
    assert.equal(headingId('Café — 24/7'), 'cafe-24-7')
    assert.equal(headingId('Привет, мир'), 'привет-мир')
    assert.equal(headingId('?!'), '')
  })
})

describe('lexicalHeadings', () => {
  it('lists the top-level headings of one level with their ids', () => {
    const value = {
      root: {
        children: [
          heading('h2', 'First ', 'part'),
          { type: 'paragraph', children: [{ type: 'text', text: 'Body' }] },
          heading('h3', 'Sub'),
          heading('h2', '  Second\n part '),
          heading('h2', '!!'),
          { type: 'quote', children: [heading('h2', 'Nested')] },
        ],
      },
    }
    assert.deepEqual(lexicalHeadings(value), [
      { id: 'first-part', text: 'First part' },
      { id: 'second-part', text: 'Second part' },
    ])
    assert.deepEqual(lexicalHeadings(value, 'h3'), [{ id: 'sub', text: 'Sub' }])
  })

  it('reads nothing from values that are not rich text', () => {
    assert.deepEqual(lexicalHeadings(null), [])
    assert.deepEqual(lexicalHeadings('text'), [])
    assert.deepEqual(lexicalHeadings({ root: {} }), [])
    assert.equal(lexicalText({ children: [{ text: 'a' }, { children: [{ text: ' b ' }] }] }), 'a b')
  })
})
