import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defineSection } from '../blocks'

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
