import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block, BlockDefinition } from './types'
import { duplicateOperation, freeValue, uniquePropValues, withUniqueProps } from './uniqueProps'

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

describe('duplicateOperation', () => {
  const scoped: BlockDefinition[] = [...defs, { type: 'form', label: 'Form', fields: [], slots: { children: { label: 'Fields' } }, uniqueScope: true }]
  const layout = {
    version: 1 as const,
    blocks: [
      {
        id: 'f',
        type: 'form',
        slots: { children: [{ id: 's', type: 'group', attrs: { id: 'contact' }, slots: { children: [field('a', 'email', 'formEmail'), field('b', 'name')] } }] },
      },
    ],
  }

  it('renames every field inside a duplicated Stack of a form, in one insert with known ids', () => {
    let n = 0
    const op = duplicateOperation(layout, 's', 'copy', scoped, () => `id${++n}`)
    assert.ok(op && op.type === 'insert')
    if (op?.type !== 'insert') return
    assert.deepEqual(op.to, { parentId: 'f', slot: 'children', index: 1 })
    assert.equal(op.block.id, 'copy')
    assert.equal(op.block.attrs, undefined)
    assert.deepEqual(op.block.slots?.children?.map((b) => [b.id, b.props?.name]), [['id1', 'email2'], ['id2', 'name2']])
  })

  it('keeps the names inside a duplicated Form block (a scope of its own)', () => {
    const op = duplicateOperation(layout, 'f', 'f2', scoped)
    assert.ok(op?.type === 'insert')
    if (op?.type !== 'insert') return
    assert.deepEqual(op.to, { parentId: null, index: 1 })
    assert.deepEqual(op.block.slots?.children?.[0]?.slots?.children?.map((b) => b.props?.name), ['email', 'name'])
    assert.equal(duplicateOperation(layout, 'missing', 'x', scoped), null)
  })
})
