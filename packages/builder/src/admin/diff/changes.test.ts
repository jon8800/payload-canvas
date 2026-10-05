import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../../blocks/defaults'
import type { Block, Layout } from '../../core/types'
import { clipText, diffLayouts, summarizeLayoutChanges, valueText, type LayoutChange } from './changes'

const blocks = defaultBlocks()
const layout = (...list: Block[]): Layout => ({ version: 1, blocks: list })
const heading = (id: string, text: string, extra: Partial<Block> = {}): Block => ({ id, type: 'heading', props: { text }, ...extra })
const quote = (id: string, text: string, extra: Partial<Block> = {}): Block => ({ id, type: 'quote', props: { quote: text }, ...extra })
const section = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({
  id,
  type: 'stack',
  props: { as: 'section' },
  slots: { children },
  ...extra,
})
const richText = (text: string, format = 0) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text, format }] }] },
})
const rich = (text: string) => richText(text)
const bold = (text: string) => richText(text, 1)
const diff = (from: unknown, to: unknown, locales?: string[]) => diffLayouts(from, to, { blocks, ...(locales ? { locales } : {}) })
const kinds = (changes: LayoutChange[]) => changes.map((c) => `${c.kind}:${c.id}`)

describe('diffLayouts', () => {
  it('finds no changes in equal layouts, whatever the key order', () => {
    const a = layout(section('s', [heading('h', 'Hi', { className: 'text-lg' })]))
    const b = JSON.parse(JSON.stringify(a)) as Layout
    b.blocks[0] = { slots: b.blocks[0].slots, props: b.blocks[0].props, type: 'stack', id: 's' }
    assert.deepEqual(diff(a, b), [])
    assert.equal(summarizeLayoutChanges([]), 'No changes to the layout')
  })

  it('treats a missing value as an empty layout', () => {
    const changes = diff(null, layout(heading('h', 'Hello')))
    assert.deepEqual(changes, [{ kind: 'added', id: 'h', name: 'Heading · Hello', inside: 0 }])
  })

  it('lists one changed quote with its old and new text', () => {
    const from = layout(section('s', [quote('q1', 'Fast and friendly.'), quote('q2', 'They rebuilt our site in a week.')]))
    const to = layout(section('s', [quote('q1', 'Fast and friendly.'), quote('q2', 'They rebuilt our site in two days.')]))
    assert.deepEqual(diff(from, to), [
      {
        kind: 'changed',
        id: 'q2',
        name: 'Quote · They rebuilt our site in two days.',
        details: [{ kind: 'value', label: 'Quote', from: 'They rebuilt our site in a week.', to: 'They rebuilt our site in two days.' }],
      },
    ])
  })

  it('lists added and removed blocks once, with what was inside and where', () => {
    const from = layout(section('s', [heading('h', 'Title')]), section('old', [heading('h2', 'Gone'), quote('q', 'Bye')]))
    const to = layout(section('s', [heading('h', 'Title'), quote('n', 'New quote')]))
    const changes = diff(from, to)
    assert.deepEqual(changes, [
      { kind: 'added', id: 'n', name: 'Quote · New quote', where: 'Section · Title', inside: 0 },
      { kind: 'removed', id: 'old', name: 'Section · Gone', inside: 2 },
    ])
    assert.equal(summarizeLayoutChanges(changes), '2 changes: 1 added, 1 removed')
  })

  it('reports only the block that moved, not the siblings it passed', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => heading(id, id.toUpperCase()))
    const from = layout(...list)
    const to = layout(list[3], list[0], list[1], list[2])
    assert.deepEqual(diff(from, to), [{ kind: 'moved', id: 'd', name: 'Heading · D', from: 'position 4', to: 'position 1' }])
  })

  it('does not report siblings as moved after an insert or a remove', () => {
    const from = layout(heading('a', 'A'), heading('b', 'B'), heading('c', 'C'))
    const to = layout(heading('x', 'X'), heading('a', 'A'), heading('c', 'C'))
    assert.deepEqual(kinds(diff(from, to)), ['added:x', 'removed:b'])
  })

  it('names the old and new parent of a block that moved between slots', () => {
    const from = layout(section('s1', [heading('h1', 'One'), quote('q', 'Move me')]), section('s2', [heading('h2', 'Two')]))
    const to = layout(section('s1', [heading('h1', 'One')]), section('s2', [heading('h2', 'Two'), quote('q', 'Move me')]))
    assert.deepEqual(diff(from, to), [{ kind: 'moved', id: 'q', name: 'Quote · Move me', from: 'Section · One', to: 'Section · Two' }])
  })

  it('names the top level when a block leaves its parent', () => {
    const from = layout(section('s', [heading('h1', 'One'), quote('q', 'Out')]))
    const to = layout(section('s', [heading('h1', 'One')]), quote('q', 'Out'))
    const [change] = diff(from, to)
    assert.deepEqual(change, { kind: 'moved', id: 'q', name: 'Quote · Out', from: 'Section · One', to: 'top level' })
  })

  it('describes styles, visibility, name, bindings and animation changes', () => {
    const from = layout(heading('h', 'Hi', { className: 'text-lg font-bold' }))
    const to = layout(
      heading('h', 'Hi', {
        className: 'text-xl font-bold',
        hidden: true,
        label: 'Hero title',
        bindings: { text: 'title' },
        motion: { enter: { preset: 'fade-up' } },
      }),
    )
    const [change] = diff(from, to)
    assert.equal(change.kind, 'changed')
    assert.equal(change.name, 'Hero title')
    assert.deepEqual(change.kind === 'changed' ? change.details : [], [
      { kind: 'value', label: 'Name', from: '', to: 'Hero title' },
      { kind: 'value', label: 'Visibility', from: 'Shown', to: 'Hidden' },
      { kind: 'classes', added: ['text-xl'], removed: ['text-lg'] },
      { kind: 'value', label: 'Binding of Text', from: '', to: '{title}' },
      { kind: 'note', label: 'Animation', text: 'Animation added' },
    ])
  })

  it('shows rich text as plain text, and select values by their option label', () => {
    const from = layout(
      { id: 'r', type: 'richText', props: { content: rich('Old words') } },
      { id: 'b', type: 'richText', props: { content: rich('Same words') } },
      heading('h', 'Hi', { props: { text: 'Hi', level: 'h2' } }),
    )
    const to = layout(
      { id: 'r', type: 'richText', props: { content: rich('New words') } },
      { id: 'b', type: 'richText', props: { content: bold('Same words') } },
      heading('h', 'Hi', { props: { text: 'Hi', level: 'h3' } }),
    )
    const changes = diff(from, to)
    const details = changes.map((c) => (c.kind === 'changed' ? c.details[0] : null))
    assert.deepEqual(details[0], { kind: 'value', label: 'Content', from: 'Old words', to: 'New words' })
    assert.deepEqual(details[1], { kind: 'note', label: 'Content', text: 'Formatting or details changed' })
    assert.equal(details[2]?.kind, 'value')
    assert.equal(details[2]?.label, 'Level')
  })

  it('lists translation changes with their locale, for the selected locales only', () => {
    const from = layout(heading('h', 'Hello', { locales: { de: { text: 'Hallo' }, fr: { text: 'Bonjour' } } }))
    const to = layout(heading('h', 'Hello', { locales: { de: { text: 'Servus' }, fr: { text: 'Salut' } } }))
    const all = diff(from, to)
    assert.deepEqual(all[0].kind === 'changed' ? all[0].details : [], [
      { kind: 'value', label: 'Text', from: 'Hallo', to: 'Servus', locale: 'de' },
      { kind: 'value', label: 'Text', from: 'Bonjour', to: 'Salut', locale: 'fr' },
    ])
    const onlyDe = diff(from, to, ['en', 'de'])
    assert.deepEqual(onlyDe[0].kind === 'changed' ? onlyDe[0].details.map((d) => ('locale' in d ? d.locale : null)) : [], ['de'])
    assert.deepEqual(diff(from, to, ['en']), [])
  })

  it('keeps unknown block types readable', () => {
    const changes = diff(layout(), layout({ id: 'x', type: 'pricingTable', props: { planName: 'Pro' } }))
    assert.deepEqual(changes, [{ kind: 'added', id: 'x', name: 'Pricing table', inside: 0 }])
  })
})

describe('value text', () => {
  it('cuts long text to one short line', () => {
    const text = clipText(`${'word '.repeat(40)}\nend`)
    assert.ok(text.length <= 80)
    assert.ok(text.endsWith('…'))
    assert.ok(!text.includes('\n'))
  })

  it('shows links by their address and uploads by their id', () => {
    assert.equal(valueText({ type: 'url', url: '/contact' }), '/contact')
    assert.equal(valueText(12, { type: 'upload', name: 'image' }), '#12')
    assert.equal(valueText(true), 'Yes')
    assert.equal(valueText(''), '')
  })
})
