import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block } from '../../../core/types'
import { canonicalJson, hashText, thumbnailKey, THUMBNAIL_VERSION } from './thumbnailKey'

const hero: Block[] = [
  {
    id: 'b_1',
    type: 'stack',
    className: 'flex flex-col',
    slots: { children: [{ id: 'b_2', type: 'heading', props: { text: 'Hello', level: '1' } }] },
  },
]

describe('thumbnailKey', () => {
  it('ignores block ids and key order', () => {
    const copy: Block[] = [
      {
        slots: { children: [{ props: { level: '1', text: 'Hello' }, type: 'heading', id: 'b_x' }] },
        type: 'stack',
        id: 'b_y',
        className: 'flex flex-col',
      },
    ]
    assert.equal(thumbnailKey(hero, 'theme', 'defs'), thumbnailKey(copy, 'theme', 'defs'))
  })

  it('changes with the content, the theme and the definitions', () => {
    const key = thumbnailKey(hero, 'theme', 'defs')
    const edited = structuredClone(hero)
    edited[0].slots!.children[0].props!.text = 'Hi'
    assert.notEqual(thumbnailKey(edited, 'theme', 'defs'), key)
    assert.notEqual(thumbnailKey(hero, 'theme 2', 'defs'), key)
    assert.notEqual(thumbnailKey(hero, 'theme', 'defs 2'), key)
    assert.ok(key.startsWith(`v${THUMBNAIL_VERSION}:`))
  })

  it('keeps "id" props that are not block ids', () => {
    assert.equal(canonicalJson({ props: { id: 'x' } }), '{"props":{"id":"x"}}')
    assert.equal(canonicalJson({ id: 'b_1', type: 'text' }), '{"type":"text"}')
  })

  it('hashes text stably', () => {
    assert.equal(hashText('abc'), hashText('abc'))
    assert.notEqual(hashText('abc'), hashText('abd'))
  })
})
