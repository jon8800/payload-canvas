import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { countText, excerpt, formatCellDate, jsonSummary, labelText, richTextExcerpt } from './cells'

describe('labelText', () => {
  it('reads strings and labels per language', () => {
    assert.equal(labelText('Link'), 'Link')
    assert.equal(labelText({ en: 'Link', de: 'Verweis' }, 'de'), 'Verweis')
    assert.equal(labelText({ en: 'Link' }, 'fr'), 'Link')
    assert.equal(labelText(() => 'x'), '')
    assert.equal(labelText({ $$typeof: Symbol('react'), type: 'span' }), '')
  })
})

describe('countText', () => {
  it('picks singular or plural and lowers the first letter of plain words', () => {
    assert.equal(countText(1, 'Link', 'Links'), '1 link')
    assert.equal(countText(3, 'Link', 'Links'), '3 links')
    assert.equal(countText(0, 'item', 'items'), '0 items')
    assert.equal(countText(2, 'FAQ', 'FAQs'), '2 FAQs')
  })
})

describe('excerpt', () => {
  it('keeps one short line', () => {
    assert.equal(excerpt('  a \n b  '), 'a b')
    assert.equal(excerpt('abcdefghij', 5), 'abcd…')
  })
})

describe('jsonSummary', () => {
  it('summarises objects, lists and plain values', () => {
    assert.equal(jsonSummary(null), '')
    assert.equal(jsonSummary([1, 2, 3]), '3 items')
    assert.equal(jsonSummary({}), 'Empty')
    assert.equal(jsonSummary({ version: 1, blocks: [{}, {}] }), '2 blocks · version: 1')
    assert.equal(jsonSummary({ a: 1, b: { c: 2 }, c: 'x', d: 4, e: 5 }), 'a: 1 · b · c: x · 2 more')
    assert.equal(jsonSummary(true), 'true')
  })
})

describe('formatCellDate', () => {
  const value = '2026-11-09T17:53:00.000Z'
  it('formats by the field appearance', () => {
    assert.equal(formatCellDate(value, 'dayAndTime', 'en-US', 'UTC'), 'Nov 9, 2026, 5:53 PM')
    assert.equal(formatCellDate(value, 'dayOnly', 'en-US', 'UTC'), 'Nov 9, 2026')
    assert.equal(formatCellDate(value, 'monthOnly', 'en-US', 'UTC'), 'November 2026')
    assert.equal(formatCellDate(value, 'timeOnly', 'en-US', 'UTC'), '5:53 PM')
  })

  it('returns nothing for values that are not dates', () => {
    assert.equal(formatCellDate('not a date'), '')
    assert.equal(formatCellDate(null), '')
  })
})

describe('richTextExcerpt', () => {
  it('joins paragraphs with a space and skips non-text nodes', () => {
    const value = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world' }] },
          { type: 'upload', value: 1 },
          { type: 'heading', children: [{ type: 'text', text: 'Next' }] },
        ],
      },
    }
    assert.equal(richTextExcerpt(value), 'Hello world Next')
    assert.equal(richTextExcerpt({ root: { children: [] } }), '')
    assert.equal(richTextExcerpt('text'), '')
  })
})
