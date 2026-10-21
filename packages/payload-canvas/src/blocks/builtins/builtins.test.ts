import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plainToRichText, resolveBindings, withoutBoundRequired } from '../../core/bindings'
import { validateLayout } from '../../core/validate'
import type { BlockDefinition, Layout } from '../../core/types'
import { defaultBlocks } from '../defaults'
import { builtinBlocks, BUILTIN_TYPES } from '.'

const ICONS = ['arrowRight', 'check'] as const

type LooseField = { name?: string; type: string; options?: Array<{ value: string; label: string }>; defaultValue?: unknown }
const fieldsOf = (blocks: BlockDefinition[], type: string) => (blocks.find((b) => b.type === type)?.fields ?? []) as LooseField[]

describe('builtinBlocks', () => {
  it('adds every built-in by default, and the icon block only with icon names', () => {
    assert.deepEqual(builtinBlocks({ icons: ICONS }).map((b) => b.type), [...BUILTIN_TYPES])
    assert.ok(!builtinBlocks().some((b) => b.type === 'icon'))
  })

  it('adds only the included blocks, so a site block of the same type can replace one', () => {
    assert.deepEqual(builtinBlocks({ include: ['icon'], icons: ICONS }).map((b) => b.type), ['icon'])
    const types = builtinBlocks({ include: [] }).map((b) => b.type)
    assert.deepEqual(types, [])
  })

  it('refuses unknown types and an icon block without names', () => {
    assert.throws(() => builtinBlocks({ include: ['nope' as 'icon'] }), /no built-in block "nope"/)
    assert.throws(() => builtinBlocks({ include: ['icon'] }), /needs `icons`/)
  })

  it('is plain JSON data, so it can reach the admin client', () => {
    const blocks = builtinBlocks({ icons: ICONS })
    assert.deepStrictEqual(JSON.parse(JSON.stringify(blocks)), blocks)
  })

  it('has no type of the default blocks', () => {
    const defaults = new Set(defaultBlocks().map((b) => b.type))
    assert.deepEqual(builtinBlocks({ icons: ICONS }).filter((b) => defaults.has(b.type)), [])
  })

  it('every AI example is a valid block next to the default blocks', () => {
    const blocks = [...defaultBlocks(), ...builtinBlocks({ icons: ICONS })]
    for (const def of builtinBlocks({ icons: ICONS })) {
      assert.ok(def.ai?.description, `${def.type} has no AI description`)
      assert.ok(def.ai?.example, `${def.type} has no AI example`)
      const layout = { version: 1, blocks: [{ id: 'b_example', type: def.type, ...def.ai?.example }] }
      assert.deepEqual(withoutBoundRequired(validateLayout(layout, blocks), layout), [], def.type)
    }
  })
})

describe('icon block', () => {
  it('offers the site icon names as plain string options', () => {
    const name = fieldsOf(builtinBlocks({ icons: ICONS }), 'icon').find((f) => f.name === 'name')
    assert.deepEqual(name?.options, [
      { label: 'arrow right', value: 'arrowRight' },
      { label: 'check', value: 'check' },
    ])
    assert.equal(name?.defaultValue, 'arrowRight')
  })

  it('refuses a name outside the icon set', () => {
    const blocks = builtinBlocks({ icons: ICONS })
    const layout = { version: 1, blocks: [{ id: 'i', type: 'icon', props: { name: 'rocket' } }] }
    assert.equal(validateLayout(layout, blocks).length, 1)
  })
})

describe('disclosure and accordion blocks', () => {
  it('refuses links and controls in the summary, and other blocks as accordion items', () => {
    const blocks = [...defaultBlocks(), ...builtinBlocks()]
    const summary = { version: 1, blocks: [{ id: 'd', type: 'disclosure', slots: { summary: [{ id: 'b', type: 'button', props: { label: 'Go' } }] } }] }
    assert.equal(validateLayout(summary, blocks).length, 1)
    const items = { version: 1, blocks: [{ id: 'a', type: 'accordion', slots: { items: [{ id: 't', type: 'text', props: { text: 'x' } }] } }] }
    assert.equal(validateLayout(items, blocks).length, 1)
  })
})

describe('tableOfContents block', () => {
  it('takes the rich text of the document through a binding', () => {
    const blocks = builtinBlocks()
    const body = plainToRichText('Body')
    const layout: Layout = { version: 1, blocks: [{ id: 't', type: 'tableOfContents', bindings: { content: 'content' } }] }
    const resolved = resolveBindings(layout, { collection: 'posts', doc: { content: body } }, blocks)
    assert.deepEqual(resolved.blocks[0]?.props, { content: body })
  })
})

describe('mediaBackdrop block', () => {
  it('uses the media collection option for its uploads', () => {
    const uploads = (fieldsOf(builtinBlocks({ mediaCollection: 'assets' }), 'mediaBackdrop') as Array<LooseField & { relationTo?: string }>)
      .filter((f) => f.type === 'upload')
      .map((f) => [f.name, f.relationTo])
    assert.deepEqual(uploads, [
      ['image', 'assets'],
      ['video', 'assets'],
      ['poster', 'assets'],
    ])
  })
})
