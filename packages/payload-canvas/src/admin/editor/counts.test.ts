import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countText } from './counts'

test('block counts group their digits and use the right noun', () => {
  const words = { none: 'No blocks', one: 'block', many: 'blocks' }
  assert.equal(countText(0, words, 'en-US'), 'No blocks')
  assert.equal(countText(1, words, 'en-US'), '1 block')
  assert.equal(countText(2, words, 'en-US'), '2 blocks')
  assert.equal(countText(1001, words, 'en-US'), '1,001 blocks')
  assert.equal(countText(1001, words, 'de-DE'), '1.001 blocks')
  assert.equal(countText(0, { one: 'block', many: 'blocks' }, 'en-US'), '0 blocks', 'no word for none: the number')
})
