import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changeClasses, replaceToken } from './classEdit'

describe('changeClasses', () => {
  it('adds classes at the end, once each', () => {
    assert.equal(changeClasses('p-4 card', () => false, ['md:flex', 'card', 'dark:pt-4']), 'p-4 card md:flex dark:pt-4')
  })

  it('removes the classes the test picks and keeps the order', () => {
    assert.equal(changeClasses('card p-4 md:card flex', (t) => t.endsWith('card')), 'p-4 flex')
  })

  it('gives an empty string when nothing is left', () => {
    assert.equal(changeClasses('  card  ', () => true), '')
  })
})

describe('replaceToken', () => {
  it('replaces one class in place', () => {
    assert.equal(replaceToken('p-4 dark:pt-4 flex', 'dark:pt-4', 'dark:pt-8'), 'p-4 dark:pt-8 flex')
  })

  it('removes the class when the new text is empty', () => {
    assert.equal(replaceToken('p-4 dark:pt-4 flex', 'dark:pt-4', '  '), 'p-4 flex')
  })

  it('puts several classes in its place and drops repeats', () => {
    assert.equal(replaceToken('p-4 x flex', 'x', 'a flex b'), 'p-4 a flex b')
  })
})
