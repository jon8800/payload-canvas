import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block, BlockDefinition } from './types'
import { freeValue, uniquePropValues, withUniqueProps } from './uniqueProps'

const defs: BlockDefinition[] = [
  { type: 'formText', label: 'Text', fields: [{ name: 'name', type: 'text' }], uniqueProps: ['name'] },
  { type: 'formEmail', label: 'Email', fields: [{ name: 'name', type: 'text' }], uniqueProps: ['name'] },
  { type: 'group', label: 'Group', fields: [], slots: { children: { label: 'Children' } } },
]
const field = (id: string, name: string, type = 'formText'): Block => ({ id, type, props: { name } })

describe('freeValue', () => {
  it('keeps a free value', () => assert.equal(freeValue('text', new Set(['email'])), 'text'))
  it('counts up from 2', () => assert.equal(freeValue('text', new Set(['text', 'text2'])), 'text3'))
  it('counts on from a numbered value', () => assert.equal(freeValue('text2', new Set(['text', 'text2'])), 'text3'))
})

describe('withUniqueProps', () => {
  it('renames a clash across block types', () => {
    const taken = uniquePropValues([field('a', 'email', 'formEmail')], defs)
    assert.deepEqual(withUniqueProps(field('b', 'email'), defs, taken).props, { name: 'email2' })
  })

  it('returns the same block when nothing clashes', () => {
    const block = field('b', 'company')
    assert.equal(withUniqueProps(block, defs, uniquePropValues([field('a', 'text')], defs)), block)
  })

  it('gives copies pasted together different values, inside slots too', () => {
    const taken = uniquePropValues([field('a', 'text')], defs)
    const group: Block = { id: 'g', type: 'group', slots: { children: [field('b', 'text'), field('c', 'text')] } }
    const result = withUniqueProps(group, defs, taken)
    assert.deepEqual(
      result.slots?.children?.map((b) => b.props?.name),
      ['text2', 'text3'],
    )
  })

  it('ignores types without unique props and empty values', () => {
    const block: Block = { id: 'b', type: 'formText', props: { name: '' } }
    assert.equal(withUniqueProps(block, defs, new Map([['name', new Set([''])]])), block)
  })
})
