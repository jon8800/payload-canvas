import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks/defaults'
import {
  blocksHaveMotion,
  checkMotion,
  describeMotion,
  enterFrom,
  enterTiming,
  enterView,
  ENTER_PRESETS,
  interactTransform,
  loopPlan,
  motionAttributes,
  motionJsonSchema,
  motionProblems,
  MOTION_KINDS,
  MOTION_PRESET_INFO,
  MOTION_SPECS,
  normalizeMotion,
  parseMotionAttribute,
  scrollPlan,
} from './motion'
import { applyOperation, applyOperations } from './operations'
import { blockJsonSchema, layoutJsonSchema } from './schema'
import { findBlock, normalizeLayout } from './tree'
import type { Layout, Operation } from './types'
import { validateLayout } from './validate'

const blocks = defaultBlocks()

function ok(result: ReturnType<typeof applyOperation>) {
  if (!result.ok) throw new Error(result.error)
  return result
}

function roundTrip(layout: Layout, op: Operation): Layout {
  const result = ok(applyOperation(structuredClone(layout), op))
  const undone = ok(applyOperations(result.layout, result.inverse))
  assert.deepStrictEqual(undone.layout, layout)
  return result.layout
}

const base: Layout = {
  version: 1,
  blocks: [{ id: 'a', type: 'heading', props: { text: 'Hi' } }],
}

describe('motion presets', () => {
  it('has a label and description for every preset of every kind', () => {
    for (const kind of MOTION_KINDS) {
      const info = MOTION_PRESET_INFO[kind].map((p) => p.value)
      assert.deepStrictEqual(info, [...MOTION_SPECS[kind].presets], kind)
      for (const p of MOTION_PRESET_INFO[kind]) assert.ok(p.label && p.description)
    }
  })

  it('every entrance starts hidden and animates only opacity, transform, filter or clip-path', () => {
    for (const preset of ENTER_PRESETS) {
      const from = enterFrom({ preset })
      assert.ok(Object.keys(from).every((k) => ['opacity', 'transform', 'filter', 'clipPath'].includes(k)), preset)
      assert.ok(from.opacity === 0 || from.clipPath !== undefined, `${preset} starts hidden`)
    }
  })

  it('uses the distance for slides', () => {
    assert.deepStrictEqual(enterFrom({ preset: 'fade-up', distance: 40 }), { opacity: 0, transform: 'translateY(40px)' })
    assert.deepStrictEqual(enterFrom({ preset: 'fade-right' }), { opacity: 0, transform: 'translateX(-24px)' })
  })
})

describe('reduced motion', () => {
  it('turns every entrance into a short fade', () => {
    for (const preset of ENTER_PRESETS) assert.deepStrictEqual(enterFrom({ preset }, true), { opacity: 0 })
    assert.deepStrictEqual(enterTiming({ preset: 'fade-up', duration: 1200, easing: 'bouncy', stagger: 120 }, true), {
      duration: 300,
      delay: 0,
      easing: 'ease-out',
      stagger: 40,
    })
  })

  it('drops scroll movement and loops but keeps the scroll fade', () => {
    assert.equal(scrollPlan({ preset: 'parallax' }, true), null)
    assert.equal(scrollPlan({ preset: 'zoom' }, true), null)
    assert.equal(scrollPlan({ preset: 'fade' }, true)?.property, 'opacity')
    assert.equal(loopPlan({ preset: 'float' }, true), null)
  })
})

describe('plans', () => {
  it('has defaults for timing and the view trigger', () => {
    assert.deepStrictEqual(enterTiming({ preset: 'fade' }), { duration: 600, delay: 0, easing: 'ease-out', stagger: 0 })
    assert.deepStrictEqual(enterView({ preset: 'fade' }), { amount: 0.2, offset: 0, repeat: false, load: false })
    assert.deepStrictEqual(enterView({ preset: 'fade', trigger: 'load', repeat: true }), { amount: 0.2, offset: 0, repeat: true, load: true })
  })

  it('builds parallax against the scroll', () => {
    assert.deepStrictEqual(scrollPlan({ preset: 'parallax', distance: 50 })?.keyframes, ['0px 50px', '0px -50px'])
  })

  it('combines hover and press transforms', () => {
    const hover = { preset: 'lift' as const }
    const press = { preset: 'shrink' as const }
    assert.equal(interactTransform(hover, press, { hovered: false, pressed: false }), 'none')
    assert.equal(interactTransform(hover, press, { hovered: true, pressed: false }), 'translateY(-4px)')
    assert.equal(interactTransform(hover, press, { hovered: true, pressed: true }), 'translateY(-4px) scale(0.97)')
    assert.equal(
      interactTransform({ preset: 'tilt', angle: 10 }, undefined, { hovered: true, pressed: false, tilt: [1, -0.5] }),
      'perspective(800px) rotateX(5deg) rotateY(10deg)',
    )
  })

  it('loops float and pulse', () => {
    assert.deepStrictEqual(loopPlan({ preset: 'float' }), { property: 'translate', keyframes: ['0px 0px', '0px -8px'], duration: 3000 })
    assert.deepStrictEqual(loopPlan({ preset: 'pulse', scale: 1.1 }), { property: 'scale', keyframes: [1, 1.1], duration: 1500 })
  })
})

describe('checking', () => {
  it('accepts a full valid value and keeps it canonical', () => {
    const value = {
      enter: { preset: 'fade-up', duration: 500, delay: 100, easing: 'spring', distance: 30, trigger: 'view', amount: 0.5, offset: 40, repeat: false, stagger: 80 },
      hover: { preset: 'lift', distance: 6 },
      press: { preset: 'shrink' },
      scroll: { preset: 'parallax', distance: -40 },
      loop: { preset: 'pulse', duration: 2000 },
    }
    assert.deepStrictEqual(motionProblems(value), [])
    const checked = checkMotion(value)
    assert.ok(checked && typeof checked === 'object')
    assert.equal('repeat' in checked.enter!, false, 'false booleans are left out')
  })

  it('refuses unknown presets, kinds and keys, and values out of range', () => {
    assert.match(String(checkMotion({ enter: { preset: 'spin' } })), /must be one of: fade, fade-up/)
    assert.match(String(checkMotion({ enter: { preset: 'fade', duration: 99999 } })), /from 50 to 5000/)
    assert.match(String(checkMotion({ enter: { preset: 'fade', speed: 2 } })), /Unknown key "speed"/)
    assert.match(String(checkMotion({ wobble: { preset: 'x' } })), /Unknown motion kind "wobble"/)
    assert.match(String(checkMotion({ enter: { preset: 'fade', easing: 'ease-in' } })), /easing must be one of/)
    assert.match(String(checkMotion('fade')), /must be an object/)
  })

  it('normalizes leniently: keeps valid kinds and values, drops the rest', () => {
    assert.deepStrictEqual(normalizeMotion({ enter: { preset: 'fade', duration: -5, x: 1 }, hover: { preset: 'nope' }, junk: 1 }), {
      enter: { preset: 'fade' },
    })
    assert.equal(normalizeMotion({}), undefined)
    assert.equal(normalizeMotion(null), undefined)
  })
})

describe('layout integration', () => {
  it('normalizeLayout keeps valid motion and drops empty or broken motion', () => {
    const layout = normalizeLayout({
      version: 1,
      blocks: [
        { id: 'a', type: 'heading', motion: { enter: { preset: 'fade-up' } } },
        { id: 'b', type: 'heading', motion: {} },
        { id: 'c', type: 'heading', motion: { enter: { preset: 'bad' } } },
      ],
    })
    assert.deepStrictEqual(layout.blocks[0].motion, { enter: { preset: 'fade-up' } })
    assert.equal('motion' in layout.blocks[1], false)
    assert.equal('motion' in layout.blocks[2], false)
  })

  it('validateLayout reports bad motion as invalid and unknown keys as warnings', () => {
    const errors = validateLayout(
      { version: 1, blocks: [{ id: 'a', type: 'heading', props: { text: 'x' }, motion: { enter: { preset: 'fade', delay: -1 }, hover: { preset: 'lift', foo: 1 } } }] },
      blocks,
    )
    assert.deepStrictEqual(
      errors.map((e) => [e.path, e.code]),
      [
        ['blocks[0].motion.enter.delay', 'invalid'],
        ['blocks[0].motion.hover.foo', 'unknown-key'],
      ],
    )
    assert.deepStrictEqual(validateLayout({ version: 1, blocks: [{ id: 'a', type: 'heading', props: { text: 'x' }, motion: { enter: { preset: 'fade' } } }] }, blocks), [])
  })

  it('update sets, replaces and removes kinds, and undo restores the exact layout', () => {
    let layout = roundTrip(base, { type: 'update', id: 'a', motion: { enter: { preset: 'fade-up' } } })
    assert.deepStrictEqual(findBlock(layout, 'a')?.motion, { enter: { preset: 'fade-up' } })
    layout = roundTrip(layout, { type: 'update', id: 'a', motion: { hover: { preset: 'lift' } } })
    assert.deepStrictEqual(findBlock(layout, 'a')?.motion, { enter: { preset: 'fade-up' }, hover: { preset: 'lift' } })
    layout = roundTrip(layout, { type: 'update', id: 'a', motion: { enter: { preset: 'fade', duration: 300 } } })
    assert.deepStrictEqual(findBlock(layout, 'a')?.motion?.enter, { preset: 'fade', duration: 300 })
    layout = roundTrip(layout, { type: 'update', id: 'a', motion: { enter: null } })
    assert.deepStrictEqual(findBlock(layout, 'a')?.motion, { hover: { preset: 'lift' } })
    layout = roundTrip(layout, { type: 'update', id: 'a', motion: null })
    assert.equal('motion' in findBlock(layout, 'a')!, false)
  })

  it('update refuses invalid motion with a clear message', () => {
    const result = applyOperation(base, { type: 'update', id: 'a', motion: { enter: { preset: 'fade', duration: 'slow' } } as never })
    assert.equal(result.ok, false)
    assert.match((result as { error: string }).error, /motion\.enter\.duration must be a number/)
  })

  it('insert checks and keeps motion; remove and undo keep it', () => {
    const block = { id: 'n', type: 'heading', props: { text: 'x' }, motion: { enter: { preset: 'zoom-in', repeat: false } } }
    const layout = roundTrip(base, { type: 'insert', block: block as never, to: { parentId: null, index: 1 } })
    assert.deepStrictEqual(findBlock(layout, 'n')?.motion, { enter: { preset: 'zoom-in' } })
    roundTrip(layout, { type: 'remove', id: 'n' })
    const bad = applyOperation(base, { type: 'insert', block: { id: 'n', type: 'heading', motion: { enter: {} } } as never, to: { parentId: null, index: 0 } })
    assert.equal(bad.ok, false)
  })

  it('duplicate copies motion', () => {
    const layout = ok(applyOperation(base, { type: 'update', id: 'a', motion: { hover: { preset: 'grow' } } })).layout
    const copy = ok(applyOperation(layout, { type: 'duplicate', id: 'a', newId: 'a2' })).layout
    assert.deepStrictEqual(findBlock(copy, 'a2')?.motion, { hover: { preset: 'grow' } })
  })

  it('JSON Schemas reference one shared motion schema', () => {
    const heading = blocks.find((b) => b.type === 'heading')!
    const one = blockJsonSchema(heading, blocks) as { properties: Record<string, unknown>; $defs: Record<string, unknown> }
    assert.deepStrictEqual(one.properties.motion, { $ref: '#/$defs/%24motion' })
    assert.ok(one.$defs.$motion)
    const all = layoutJsonSchema(blocks) as { $defs: Record<string, unknown> }
    assert.deepStrictEqual(all.$defs.$motion, motionJsonSchema())
  })
})

describe('rendering helpers', () => {
  it('builds the attributes: reveal on the block, or on the items when it staggers', () => {
    assert.deepStrictEqual(motionAttributes({ enter: { preset: 'fade' } }), { 'data-motion': '{"enter":{"preset":"fade"}}', 'data-motion-reveal': '' })
    assert.deepStrictEqual(motionAttributes({ enter: { preset: 'fade', stagger: 80 } }), { 'data-motion': '{"enter":{"preset":"fade","stagger":80}}' })
    assert.deepStrictEqual(motionAttributes({ hover: { preset: 'lift' } }), { 'data-motion': '{"hover":{"preset":"lift"}}' })
    assert.deepStrictEqual(motionAttributes(undefined, true), { 'data-motion-item': '', 'data-motion-reveal': '' })
    assert.deepStrictEqual(motionAttributes(undefined), {})
  })

  it('parses the attribute leniently', () => {
    assert.deepStrictEqual(parseMotionAttribute('{"enter":{"preset":"fade"}}'), { enter: { preset: 'fade' } })
    assert.equal(parseMotionAttribute('{oops'), undefined)
    assert.equal(parseMotionAttribute(null), undefined)
  })

  it('finds motion at any depth, skipping hidden blocks', () => {
    assert.equal(blocksHaveMotion([{ id: 'a', type: 'x', slots: { children: [{ id: 'b', type: 'y', motion: { hover: { preset: 'lift' } } }] } }]), true)
    assert.equal(blocksHaveMotion([{ id: 'a', type: 'x', hidden: true, motion: { hover: { preset: 'lift' } } }]), false)
    assert.equal(blocksHaveMotion([{ id: 'a', type: 'x' }]), false)
  })

  it('describes motion in words', () => {
    assert.equal(
      describeMotion({ enter: { preset: 'fade-up', stagger: 60 }, hover: { preset: 'lift' } }),
      'Fade up on scroll (children in turn), Lift on hover',
    )
  })
})
