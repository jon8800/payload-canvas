import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defineSection, withDefaultClassNames } from '../blocks'
import { sectionsWithDefaultClassNames } from './blocks'

describe('defineSection', () => {
  it('fills missing block ids in walk order, at any depth, without clashing with given ids', () => {
    const section = defineSection({
      id: 'hero',
      label: 'Hero',
      blocks: [
        {
          type: 'stack',
          slots: {
            children: [
              { id: 'hero_2', type: 'heading', props: { text: 'Hi' } },
              { type: 'button' },
            ],
            aside: [{ type: 'image' }],
          },
        },
        { type: 'text' },
      ],
    })
    assert.equal(section.blocks[0].id, 'hero_1')
    assert.deepEqual(section.blocks[0].slots?.children?.map((b) => b.id), ['hero_2', 'hero_3'])
    assert.equal(section.blocks[0].slots?.aside?.[0]?.id, 'hero_4')
    assert.equal(section.blocks[1].id, 'hero_5')
    assert.deepEqual(section.blocks[0].slots?.children?.[0]?.props, { text: 'Hi' })
    assert.equal(section.label, 'Hero')
  })
  it('gives the same ids every time and leaves the input alone', () => {
    const input = { id: 's', label: 'S', blocks: [{ type: 'stack', slots: { children: [{ type: 'text' }] } }] }
    assert.deepEqual(defineSection(input), defineSection(input))
    assert.equal('id' in input.blocks[0], false)
  })
  it('throws on a missing id or label and on a repeated block id', () => {
    assert.throws(() => defineSection({ id: '', label: 'X', blocks: [] }), /needs an "id"/)
    assert.throws(() => defineSection({ id: 'x', label: ' ', blocks: [] }), /needs a "label"/)
    assert.throws(
      () => defineSection({ id: 'x', label: 'X', blocks: [{ id: 'a', type: 'stack', slots: { children: [{ id: 'a', type: 'text' }] } }] }),
      /two blocks have the id "a"/,
    )
  })
})

describe('withDefaultClassNames', () => {
  const defs = [
    { type: 'stack', label: 'Stack', fields: [], defaultClassName: 'flex flex-col', slots: { children: {} } },
    { type: 'text', label: 'Text', fields: [], defaultClassName: 'break-words' },
  ]
  it('fills a missing className at any depth and keeps given or empty ones', () => {
    const blocks = withDefaultClassNames(
      [{ id: 'a', type: 'stack', slots: { children: [{ id: 'b', type: 'text' }, { id: 'c', type: 'text', className: '' }, { id: 'd', type: 'text', className: 'p-4' }, { id: 'e', type: 'unknown' }] } }],
      defs,
    )
    assert.equal(blocks[0].className, 'flex flex-col')
    assert.deepEqual(blocks[0].slots?.children?.map((b) => b.className), ['break-words', '', 'p-4', undefined])
    assert.equal('className' in (blocks[0].slots?.children?.[3] ?? {}), false)
  })
  it('runs on every section', () => {
    const [section] = sectionsWithDefaultClassNames([{ id: 's', label: 'S', blocks: [{ id: 'a', type: 'text' }] }], defs)
    assert.equal(section.blocks[0].className, 'break-words')
  })
})
