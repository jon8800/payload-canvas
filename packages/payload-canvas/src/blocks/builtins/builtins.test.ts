import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plainToRichText, resolveBindings, withoutBoundRequired } from '../../core/bindings'
import { starterSlots } from '../../core/blocks'
import { validateLayout } from '../../core/validate'
import type { BlockDefinition, Layout } from '../../core/types'
import { defaultBlocks } from '../defaults'
import { builtinBlocks, BUILTIN_TYPES } from '.'

const ICONS = ['arrowRight', 'check'] as const
const canEdit = () => false

type LooseField = { name?: string; type: string; options?: Array<{ value: string; label: string }>; defaultValue?: unknown }
const fieldsOf = (blocks: BlockDefinition[], type: string) => (blocks.find((b) => b.type === type)?.fields ?? []) as LooseField[]

describe('builtinBlocks', () => {
  it('adds every built-in by default, and the icon block only with icon names', () => {
    // `tabs` brings its child type `tab`.
    const expected = BUILTIN_TYPES.filter((type) => type !== 'embed').flatMap((type) => (type === 'tabs' ? ['tabs', 'tab'] : [type]))
    assert.deepEqual(builtinBlocks({ icons: ICONS }).map((b) => b.type), expected)
    assert.ok(!builtinBlocks().some((b) => b.type === 'icon'))
    assert.deepEqual(builtinBlocks({ include: ['tabs'] }).map((b) => b.type), ['tabs', 'tab'])
  })

  it('adds the embed block only when asked: its code runs on the site', () => {
    assert.ok(!builtinBlocks({ icons: ICONS }).some((b) => b.type === 'embed'))
    assert.ok(builtinBlocks({ embed: {} }).some((b) => b.type === 'embed'))
    assert.deepEqual(builtinBlocks({ include: ['embed'] }).map((b) => b.type), ['embed'])
  })

  it('embed: an HTML code field with a length limit, and who may change the code', () => {
    const plain = builtinBlocks({ include: ['embed'] })[0]!
    const code = plain.fields.find((f) => 'name' in f && f.name === 'code') as LooseField & { maxLength?: number; admin?: { language?: string }; access?: unknown }
    assert.equal(code.type, 'code')
    assert.equal(code.admin?.language, 'html')
    assert.equal(code.maxLength, 50_000)
    assert.equal(code.access, undefined)
    assert.deepEqual(fieldsOf([plain], 'embed').find((f) => f.name === 'mode')?.options?.map((o) => o.value), ['inline', 'isolated'])
    assert.ok(plain.description && plain.description.length < 120)
    assert.ok(plain.ai?.description && plain.ai.example)
    const limited = builtinBlocks({ embed: { canEdit, maxLength: 100 } }).find((b) => b.type === 'embed')!
    for (const name of ['code', 'mode']) {
      const field = limited.fields.find((f) => 'name' in f && f.name === name) as { access?: { create?: unknown; update?: unknown } }
      assert.equal(field.access?.update, canEdit, name)
      assert.equal(field.access?.create, canEdit, name)
    }
    assert.equal((limited.fields.find((f) => 'name' in f && f.name === 'code') as { maxLength?: number }).maxLength, 100)
    // Too long blocks Publish only, like other limits.
    const layout: Layout = { version: 1, blocks: [{ id: 'e', type: 'embed', props: { code: 'x'.repeat(101) } }] }
    const errors = validateLayout(layout, [limited])
    assert.ok(errors.some((e) => /at most 100 characters/.test(e.message)))
  })

  it('has no image viewer or media backdrop any more', () => {
    assert.throws(() => builtinBlocks({ include: ['imageViewer' as 'icon'] }), /no built-in block "imageViewer"/)
    assert.throws(() => builtinBlocks({ include: ['mediaBackdrop' as 'icon'] }), /no built-in block "mediaBackdrop"/)
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

  it('every block has its own editor icon, a category and a description', () => {
    const glyphs = new Set(['icon', 'disclosure', 'accordion', 'popup', 'tabs', 'tab', 'carousel', 'marquee', 'tableOfContents', 'filter', 'adjacentLinks', 'embed'])
    for (const def of builtinBlocks({ icons: ICONS, embed: {} })) {
      assert.ok(def.icon && glyphs.has(def.icon), `${def.type} icon "${def.icon}"`)
      assert.ok(['Content', 'Media', 'Interactive', 'Dynamic'].includes(def.category ?? ''), `${def.type} category`)
    }
    for (const type of ['popup', 'tabs', 'tab', 'marquee', 'adjacentLinks']) {
      const def = builtinBlocks().find((b) => b.type === type)
      assert.ok(def?.description && def.description.length < 120, `${type} description`)
    }
  })

  it('has no type of the default blocks', () => {
    const defaults = new Set(defaultBlocks().map((b) => b.type))
    assert.deepEqual(builtinBlocks({ icons: ICONS }).filter((b) => defaults.has(b.type)), [])
  })

  it('every AI example is a valid block next to the default blocks', () => {
    const blocks = [...defaultBlocks(), ...builtinBlocks({ include: BUILTIN_TYPES, icons: ICONS })]
    for (const def of builtinBlocks({ include: BUILTIN_TYPES, icons: ICONS })) {
      assert.ok(def.ai?.description, `${def.type} has no AI description`)
      assert.ok(def.ai?.example, `${def.type} has no AI example`)
      const example = { id: 'b_example', type: def.type, ...def.ai?.example }
      // A block that goes only inside another one (a tab) is checked there, with a second copy for the parent's `min`.
      const parent = def.parents?.[0]
      const slot = parent ? Object.keys(blocks.find((b) => b.type === parent)?.slots ?? {})[0] : undefined
      const list = parent && slot ? [{ id: 'b_parent', type: parent, slots: { [slot]: [example, { ...example, id: 'b_example_2nd', slots: {} }] } }] : [example]
      const layout = { version: 1, blocks: list }
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

const popup = (trigger: Layout['blocks'], content: Layout['blocks'] = []): Layout => ({ version: 1, blocks: [{ id: 'p', type: 'popup', slots: { trigger, content } }] })
const side = (id: string) => ({ id, type: 'collectionList', props: { collection: 'posts', limit: 1 } })

describe('popup block', () => {
  it('refuses links and controls in its trigger (a <button>), not in its content', () => {
    const blocks = [...defaultBlocks(), ...builtinBlocks()]
    assert.equal(validateLayout(popup([{ id: 'b', type: 'button', props: { label: 'Go' } }]), blocks).length, 1)
    assert.equal(validateLayout(popup([{ id: 'n', type: 'popup' }]), blocks).length, 1)
    assert.deepEqual(validateLayout(popup([{ id: 't', type: 'text', props: { text: 'Open' } }], [{ id: 'b', type: 'button', props: { label: 'Go' } }]), blocks), [])
  })

  it('has panel and close parts and styled trigger and content slots; backdrop: classes on the panel colour the backdrop', () => {
    const def = builtinBlocks().find((b) => b.type === 'popup')!
    assert.deepEqual(Object.keys(def.parts ?? {}), ['panel', 'close'])
    assert.ok(def.slots?.trigger?.styles && def.slots.content?.styles)
    assert.match(def.parts?.panel?.defaultClassName ?? '', /backdrop:bg-/)
  })
})

describe('tabs block', () => {
  it('holds only tab blocks, and a tab goes only into tabs', () => {
    const blocks = [...defaultBlocks(), ...builtinBlocks()]
    const tab = { id: 't1', type: 'tab', props: { label: 'One' } }
    const wrong = { version: 1, blocks: [{ id: 'x', type: 'tabs', slots: { tabs: [tab, { id: 'b', type: 'text', props: { text: 'x' } }] } }] }
    assert.ok(validateLayout(wrong, blocks).some((error) => error.blockId === 'b'))
    assert.equal(validateLayout({ version: 1, blocks: [tab] }, blocks).length, 1)
  })

  it('a new tabs block starts with two tabs', () => {
    let n = 0
    assert.deepEqual(starterSlots(builtinBlocks(), 'tabs', () => `n${++n}`), { tabs: [{ id: 'n1', type: 'tab' }, { id: 'n2', type: 'tab' }] })
  })

  it('has the tab row, each tab and each panel as parts', () => {
    const def = builtinBlocks().find((b) => b.type === 'tabs')!
    assert.deepEqual(Object.keys(def.parts ?? {}), ['list', 'tab', 'panel'])
    assert.match(def.parts?.tab?.defaultClassName ?? '', /aria-selected:/)
  })
})

describe('marquee block', () => {
  it('offers speed, direction and pause on hover, and styles its items row', () => {
    const def = builtinBlocks().find((b) => b.type === 'marquee')!
    assert.deepEqual(fieldsOf([def], 'marquee').map((f) => [f.name, f.defaultValue]), [
      ['speed', 'normal'],
      ['direction', 'left'],
      ['pauseOnHover', true],
    ])
    assert.ok(def.slots?.children?.styles)
  })
})

describe('adjacentLinks block', () => {
  it('holds one collection list per side', () => {
    const blocks = [...defaultBlocks(), ...builtinBlocks()]
    const ok = { version: 1, blocks: [{ id: 'a', type: 'adjacentLinks', slots: { previous: [side('p')], next: [side('n')] } }] }
    assert.deepEqual(validateLayout(ok, blocks), [])
    const two = { version: 1, blocks: [{ id: 'a', type: 'adjacentLinks', slots: { previous: [side('p'), side('q')] } }] }
    assert.equal(validateLayout(two, blocks).length, 1)
    const text = { version: 1, blocks: [{ id: 'a', type: 'adjacentLinks', slots: { next: [{ id: 't', type: 'text', props: { text: 'x' } }] } }] }
    assert.equal(validateLayout(text, blocks).length, 1)
  })

  it('its example finds the documents before and after the page by the page date', () => {
    const example = builtinBlocks().find((b) => b.type === 'adjacentLinks')!.ai!.example!
    const [previous] = example.slots!.previous!
    const [next] = example.slots!.next!
    assert.deepEqual(previous!.props, { collection: 'posts', limit: 1, sort: '-publishedAt', where: { publishedAt: { less_than: '$page.publishedAt' } } })
    assert.deepEqual(next!.props, { collection: 'posts', limit: 1, sort: 'publishedAt', where: { publishedAt: { greater_than: '$page.publishedAt' } } })
  })
})
