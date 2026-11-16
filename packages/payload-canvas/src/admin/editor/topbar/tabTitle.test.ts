import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { tabTitle } from './tabTitle'

// What `document.title` returns after a set: ASCII whitespace collapsed, ends trimmed.
const readBack = (value: string) => value.replace(/[\t\n\f\r ]+/g, ' ').trim()

describe('tabTitle', () => {
  it('names the document and the builder', () => {
    assert.equal(tabTitle('Home', false), 'Home · Builder')
    assert.equal(tabTitle('Hero', true), 'Section: Hero · Builder')
  })

  it('matches what the browser reads back, so the title is set once', () => {
    for (const title of ['Home ', '  About   us ', 'Line\nbreak', 'Tab\there']) {
      const wanted = tabTitle(title, false)
      assert.equal(readBack(wanted), wanted)
    }
  })
})
