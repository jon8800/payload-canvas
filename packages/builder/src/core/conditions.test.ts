import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { conditionFromFunction, conditionMet, readCondition } from './conditions'

describe('conditionFromFunction', () => {
  const cases: Array<[string, unknown, unknown]> = [
    ['optional chain', (_: unknown, s: { type?: string }) => s?.type === 'custom', { field: 'type', equals: 'custom' }],
    ['dot access', (_: unknown, s: { type?: string }) => s.type === 'reference', { field: 'type', equals: 'reference' }],
    ['not equal', (_: unknown, s: { source?: string }) => s?.source !== 'manual', { field: 'source', notEquals: 'manual' }],
    ['value first', (_: unknown, s: { mode?: string }) => 'custom' === s?.mode, { field: 'mode', equals: 'custom' }],
    ['double bang', (_: unknown, s: { text?: string }) => !!s?.text, { field: 'text', truthy: true }],
    ['plain read', (_: unknown, s: { enableLink?: boolean }) => s?.enableLink, { field: 'enableLink', truthy: true }],
    ['negation', (_: unknown, s: { text?: string }) => !s?.text, { field: 'text', truthy: false }],
    ['Boolean()', (_: unknown, s: { text?: string }) => Boolean(s?.text), { field: 'text', truthy: true }],
    ['number', (_: unknown, s: { count?: number }) => s?.count === 3, { field: 'count', equals: 3 }],
    ['destructured', (_: unknown, { type }: { type?: string }) => type === 'custom', { field: 'type', equals: 'custom' }],
    // oxlint-disable-next-line func-names
    ['function with return', function (_: unknown, s: { type?: string }) { return s?.type === 'a' }, { field: 'type', equals: 'a' }],
    ['guarded', (_: unknown, s: { type?: string }) => s && s.type === 'b', { field: 'type', equals: 'b' }],
  ]
  for (const [name, fn, expected] of cases) {
    it(`reads ${name}`, () => assert.deepEqual(conditionFromFunction(fn), expected))
  }

  it('reads minified code', () => {
    // oxlint-disable-next-line no-new-func
    const fn = new Function('return (e,t)=>"reference"===t?.type')()
    assert.deepEqual(conditionFromFunction(fn), { field: 'type', equals: 'reference' })
  })

  it('returns null for conditions it cannot express', () => {
    assert.equal(conditionFromFunction((data: { a?: string }) => data.a === 'x'), null)
    assert.equal(conditionFromFunction((_: unknown, s: { a?: string; b?: string }) => s.a === 'x' && s.b === 'y'), null)
    assert.equal(conditionFromFunction((_: unknown, __: unknown, { user }: { user?: unknown }) => Boolean(user)), null)
    assert.equal(conditionFromFunction('not a function'), null)
  })
})

describe('conditionMet', () => {
  it('compares with equals, notEquals and truthy', () => {
    assert.equal(conditionMet({ field: 'type', equals: 'a' }, { type: 'a' }), true)
    assert.equal(conditionMet({ field: 'type', equals: ['a', 'b'] }, { type: 'b' }), true)
    assert.equal(conditionMet({ field: 'type', notEquals: 'a' }, { type: 'a' }), false)
    assert.equal(conditionMet({ field: 'text', truthy: true }, { text: '' }), false)
    assert.equal(conditionMet({ field: 'text', truthy: false }, {}), true)
  })

  it('uses the sibling default when the sibling has no value', () => {
    const fields = [{ name: 'type', defaultValue: 'reference' }]
    assert.equal(conditionMet({ field: 'type', equals: 'reference' }, {}, fields), true)
    assert.equal(conditionMet({ field: 'type', equals: 'custom' }, { type: null }, fields), false)
  })
})

describe('readCondition', () => {
  it('reads admin.custom.builderCondition', () => {
    assert.deepEqual(readCondition({ admin: { custom: { builderCondition: { field: 'a', equals: 1 } } } }), { field: 'a', equals: 1 })
    assert.equal(readCondition({ admin: {} }), null)
    assert.equal(readCondition(null), null)
  })
})
