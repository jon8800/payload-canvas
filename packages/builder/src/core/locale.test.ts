import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { collectReferences } from './references'
import { runPropHooks } from './fieldHooks'
import { captureFieldSemantics } from './fieldSemantics'
import { deniedPropChanges } from './fieldAccess'
import { runPropValidators } from './fieldValidate'
import {
  createLocaleView,
  fallbackChain,
  localeSettingsOf,
  localizedKeys,
  localizeOperations,
  mergeLocaleView,
  resolveLayoutLocale,
  stampLocale,
  untranslatedKeys,
} from './locale'
import { applyOperation, applyOperations } from './operations'
import { normalizeLayout } from './tree'
import type { Block, BlockDefinition, Layout, LocaleSettings, Operation } from './types'
import { validateLayout } from './validate'

const heading: BlockDefinition = {
  type: 'heading',
  label: 'Heading',
  fields: [
    { name: 'text', type: 'text', localized: true, required: true },
    { name: 'level', type: 'select', options: ['1', '2'] },
  ],
}
const card: BlockDefinition = {
  type: 'card',
  label: 'Card',
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media', localized: true },
    // A non-localized array with a localized field inside: localized as a whole.
    { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text', localized: true }] },
    { name: 'count', type: 'number' },
  ],
  slots: { children: {} },
}
const blocks = [heading, card]

const settings: LocaleSettings = { locales: ['en', 'de', 'fr'], defaultLocale: 'en', fallback: true }

function layoutOf(...list: Block[]): Layout {
  return { version: 1, blocks: list }
}

function ok(result: ReturnType<typeof applyOperation>) {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('localeSettingsOf', () => {
  it('reads codes, objects, labels and own fallbacks', () => {
    const read = localeSettingsOf({
      locales: ['en', { code: 'de', label: { en: 'German' } }, { code: 'de-CH', label: 'Swiss', fallbackLocale: 'de' }],
      defaultLocale: 'en',
    })
    assert.deepEqual(read, {
      locales: ['en', 'de', 'de-CH'],
      defaultLocale: 'en',
      fallback: true,
      fallbacks: { 'de-CH': 'de' },
      labels: { de: 'German', 'de-CH': 'Swiss' },
    })
    assert.equal(localeSettingsOf(undefined), null)
    assert.equal(localeSettingsOf({ locales: [] }), null)
  })

  it('builds the fallback chain like Payload', () => {
    const own: LocaleSettings = { ...settings, fallbacks: { fr: ['de', 'en'] } }
    assert.deepEqual(fallbackChain(own, 'de'), ['en'])
    assert.deepEqual(fallbackChain(own, 'fr'), ['de', 'en'])
    assert.deepEqual(fallbackChain(own, 'en'), [])
    assert.deepEqual(fallbackChain({ ...settings, fallback: false }, 'de'), [])
    assert.deepEqual(fallbackChain(settings, 'de', 'none'), [])
    assert.deepEqual(fallbackChain(settings, 'de', false), [])
    assert.deepEqual(fallbackChain(settings, 'fr', 'de'), ['de'])
  })
})

describe('localizedKeys', () => {
  it('takes localized fields and fields that hold one', () => {
    assert.deepEqual([...localizedKeys(heading)], ['text'])
    assert.deepEqual([...localizedKeys(card)], ['image', 'items'])
  })
})

describe('update with a locale', () => {
  const base = layoutOf({ id: 'h', type: 'heading', props: { text: 'Hello', level: '2' } })

  it('writes the locale values and undoes exactly', () => {
    const op: Operation = { type: 'update', id: 'h', props: { text: 'Hallo' }, locale: 'de' }
    const result = ok(applyOperation(base, op))
    assert.deepEqual(result.layout.blocks[0], { id: 'h', type: 'heading', props: { text: 'Hello', level: '2' }, locales: { de: { text: 'Hallo' } } })
    assert.deepEqual(result.inverse, [{ type: 'update', id: 'h', locale: 'de', unsetProps: ['text'] }])
    const undone = ok(applyOperations(result.layout, result.inverse))
    assert.deepEqual(undone.layout, base)
  })

  it('removes empty locale objects', () => {
    const translated = ok(applyOperation(base, { type: 'update', id: 'h', props: { text: 'Hallo' }, locale: 'de' })).layout
    const cleared = ok(applyOperation(translated, { type: 'update', id: 'h', unsetProps: ['text'], locale: 'de' })).layout
    assert.deepEqual(cleared, base)
  })

  it('keeps locales through insert, duplicate and normalize', () => {
    const block: Block = { id: 'x', type: 'heading', props: { text: 'Hi' }, locales: { de: { text: 'Hallo' }, fr: {} } }
    const inserted = ok(applyOperation(base, { type: 'insert', block, to: { parentId: null, index: 1 } })).layout
    assert.deepEqual(inserted.blocks[1].locales, { de: { text: 'Hallo' } })
    const copy = ok(applyOperation(inserted, { type: 'duplicate', id: 'x', newId: 'y' })).layout
    assert.deepEqual(copy.blocks[2].locales, { de: { text: 'Hallo' } })
    assert.deepEqual(normalizeLayout({ blocks: [{ id: 'a', type: 'heading', locales: { de: {}, fr: { text: 'Salut' } } }] }).blocks[0].locales, {
      fr: { text: 'Salut' },
    })
  })
})

describe('localizeOperations', () => {
  const base = layoutOf({ id: 'h', type: 'heading', props: { text: 'Hello', level: '2' } })

  it('moves shared props out, drops the default locale and refuses unknown locales', () => {
    const result = localizeOperations(base, [{ type: 'update', id: 'h', props: { text: 'Hallo', level: '1' }, locale: 'de' }], blocks, settings)
    assert.ok(result.ok)
    assert.deepEqual(result.ops, [
      { type: 'update', id: 'h', props: { level: '1' } },
      { type: 'update', id: 'h', locale: 'de', props: { text: 'Hallo' } },
    ])
    const plain = localizeOperations(base, [{ type: 'update', id: 'h', props: { text: 'Hi' }, locale: 'en' }], blocks, settings)
    assert.ok(plain.ok)
    assert.deepEqual(plain.ops, [{ type: 'update', id: 'h', props: { text: 'Hi' } }])
    const bad = localizeOperations(base, [{ type: 'update', id: 'h', props: { text: 'x' }, locale: 'it' }], blocks, settings)
    assert.equal(bad.ok, false)
    const none = localizeOperations(base, [{ type: 'update', id: 'h', props: { text: 'x' }, locale: 'de' }], blocks, null)
    assert.equal(none.ok, false)
  })

  it('follows blocks inserted earlier in the batch', () => {
    const ops: Operation[] = [
      { type: 'insert', block: { id: 'n', type: 'heading' }, to: { parentId: null, index: 0 } },
      { type: 'update', id: 'n', props: { text: 'Neu', level: '1' }, locale: 'de' },
    ]
    const result = localizeOperations(base, ops, blocks, settings)
    assert.ok(result.ok)
    assert.equal(result.ops.length, 3)
  })

  it('stamps only prop updates without a locale', () => {
    const ops: Operation[] = [
      { type: 'update', id: 'h', props: { text: 'x' } },
      { type: 'update', id: 'h', className: 'p-4' },
      { type: 'update', id: 'h', props: { text: 'y' }, locale: 'fr' },
    ]
    assert.deepEqual(stampLocale(ops, 'de', settings), [
      { type: 'update', id: 'h', props: { text: 'x' }, locale: 'de' },
      { type: 'update', id: 'h', className: 'p-4' },
      { type: 'update', id: 'h', props: { text: 'y' }, locale: 'fr' },
    ])
    assert.deepEqual(stampLocale(ops, 'en', settings), ops)
  })
})

describe('resolveLayoutLocale', () => {
  const layout = layoutOf({
    id: 'c',
    type: 'card',
    props: { image: 1, count: 3, items: [{ label: 'One' }] },
    locales: { de: { image: 2 }, fr: { items: [] } },
    slots: { children: [{ id: 'h', type: 'heading', props: { text: 'Hello', level: '2' }, locales: { de: { text: '' } } }] },
  })

  it('gives each locale its values with fallback', () => {
    const de = resolveLayoutLocale(layout, blocks, settings, 'de')
    assert.deepEqual(de.blocks[0].props, { image: 2, count: 3, items: [{ label: 'One' }] })
    assert.equal(de.blocks[0].locales, undefined)
    // An empty text falls back (Payload's rule for text and textarea).
    assert.equal(de.blocks[0].slots?.children[0].props?.text, 'Hello')
    // An empty array is a value: no fallback.
    assert.deepEqual(resolveLayoutLocale(layout, blocks, settings, 'fr').blocks[0].props?.items, [])
    assert.deepEqual(resolveLayoutLocale(layout, blocks, settings, 'en').blocks[0].props, layout.blocks[0].props)
  })

  it('leaves untranslated props out without fallback', () => {
    const fr = resolveLayoutLocale(layout, blocks, { ...settings, fallback: false }, 'fr')
    assert.deepEqual(fr.blocks[0].props, { count: 3, items: [] })
    assert.deepEqual(resolveLayoutLocale(layout, blocks, settings, 'de', false).blocks[0].slots?.children[0].props, { level: '2', text: '' })
  })

  it('keeps identity of blocks without changes and caches views', () => {
    const plain = layoutOf({ id: 'a', type: 'heading', props: { text: 'Hi' } })
    assert.equal(resolveLayoutLocale(plain, blocks, settings, 'de'), plain)
    const view = createLocaleView(blocks, settings)
    const first = view(layout, 'de')
    assert.equal(view(layout, 'de').blocks[0], first.blocks[0])
    assert.equal(view(plain, 'en'), plain)
  })

  it('names untranslated props', () => {
    assert.deepEqual(untranslatedKeys(layout.blocks[0], blocks, settings, 'de'), ['items'])
    assert.deepEqual(untranslatedKeys(layout.blocks[0].slots!.children[0], blocks, settings, 'de'), ['text'])
    assert.deepEqual(untranslatedKeys(layout.blocks[0], blocks, settings, 'en'), [])
  })
})

describe('mergeLocaleView', () => {
  const stored = layoutOf(
    { id: 'h', type: 'heading', props: { text: 'Hello', level: '2' }, locales: { fr: { text: 'Bonjour' } } },
    { id: 'g', type: 'heading', props: { text: 'World' } },
  )

  it('saves a German read back without copying fallbacks', () => {
    const read = resolveLayoutLocale(stored, blocks, settings, 'de')
    const edited: Layout = { ...read, blocks: [{ ...read.blocks[0], props: { ...read.blocks[0].props, text: 'Hallo', level: '1' } }, read.blocks[1]] }
    const merged = mergeLocaleView(stored, edited, 'de', blocks, settings)
    assert.deepEqual(merged.blocks[0], { id: 'h', type: 'heading', props: { text: 'Hello', level: '1' }, locales: { fr: { text: 'Bonjour' }, de: { text: 'Hallo' } } })
    // "World" was the fallback the reader saw: it stays a fallback.
    assert.deepEqual(merged.blocks[1], { id: 'g', type: 'heading', props: { text: 'World' } })
  })

  it('keeps translations when the default locale saves, and takes the stored form as it is', () => {
    const read = resolveLayoutLocale(stored, blocks, settings, 'en')
    assert.deepEqual(mergeLocaleView(stored, read, 'en', blocks, settings), stored)
    assert.equal(mergeLocaleView(stored, stored, 'de', blocks, settings), stored)
  })
})

describe('validateLayout with locales', () => {
  it('checks own values and names the locale', () => {
    const layout = layoutOf({ id: 'h', type: 'heading', props: { text: 'Hello' }, locales: { de: { text: 5, level: '1' }, it: { text: 'Ciao' } } })
    const errors = validateLayout(layout, blocks, { localization: settings })
    assert.deepEqual(
      errors.map((e) => [e.code, e.path, e.locale]),
      [
        ['invalid', 'blocks[0].props.text', 'de'],
        ['unknown-prop', 'blocks[0].props.level', 'de'],
        ['unknown-key', 'blocks[0].locales.it', 'it'],
      ],
    )
  })

  it('requires localized props in locales without fallback only', () => {
    const layout = layoutOf({ id: 'h', type: 'heading', props: { text: 'Hello' }, locales: { de: { text: '' } } })
    assert.deepEqual(validateLayout(layout, blocks, { localization: settings }), [])
    const strict = validateLayout(layout, blocks, { localization: { ...settings, fallback: false } })
    assert.deepEqual(
      strict.map((e) => [e.code, e.locale]),
      [
        ['required', 'de'],
        ['required', 'fr'],
      ],
    )
  })
})

describe('references and field logic per locale', () => {
  it('collects references of every locale', () => {
    const layout = layoutOf({ id: 'c', type: 'card', props: { image: 1 }, locales: { de: { image: 2 } } })
    assert.deepEqual(collectReferences(layout, blocks), [
      { relationTo: 'media', value: 1 },
      { relationTo: 'media', value: 2 },
    ])
  })

  it('runs hooks on each locale with req.locale, and writes the result back', async () => {
    const seen: string[] = []
    const def: BlockDefinition = {
      type: 'slug',
      label: 'Slug',
      fields: [
        {
          name: 'value',
          type: 'text',
          localized: true,
          hooks: { beforeChange: [({ value, req }: { value?: unknown; req: { locale?: string | null } }) => (seen.push(String(req.locale)), String(value).toLowerCase())] },
        },
      ],
    }
    const registry = captureFieldSemantics([def])
    const layout = layoutOf({ id: 's', type: 'slug', props: { value: 'Red' }, locales: { de: { value: 'Rot' } } })
    const changed = await runPropHooks('beforeChange', layout, { blocks: [def], registry, ctx: { layoutField: 'layout', req: { locale: 'en' } }, localization: settings })
    assert.equal(changed, true)
    assert.deepEqual(layout.blocks[0], { id: 's', type: 'slug', props: { value: 'red' }, locales: { de: { value: 'rot' } } })
    assert.deepEqual(seen, ['en', 'de'])
  })

  it('validates and checks access of translations', async () => {
    const def: BlockDefinition = {
      type: 'sku',
      label: 'SKU',
      fields: [
        {
          name: 'code',
          type: 'text',
          localized: true,
          validate: (value: unknown) => value === 'bad' ? 'Bad code' : true,
          access: { update: () => false },
        },
      ],
    }
    const registry = captureFieldSemantics([def])
    const layout = layoutOf({ id: 'k', type: 'sku', props: { code: 'ok' }, locales: { de: { code: 'bad' } } })
    const errors = await runPropValidators(layout, { blocks: [def], registry, ctx: { layoutField: 'layout', req: {} }, localization: settings })
    assert.deepEqual(errors.map((e) => [e.message, e.locale]), [['Bad code', 'de']])

    const before = layoutOf({ id: 'k', type: 'sku', props: { code: 'ok' } })
    const denied = await deniedPropChanges(layout, { blocks: [def], registry, ctx: { layoutField: 'layout', req: {} }, before, localization: settings })
    assert.deepEqual(denied.map((d) => [d.field, d.locale]), [['code', 'de']])
    // The check must not change the layout.
    assert.deepEqual(layout.blocks[0].locales, { de: { code: 'bad' } })
  })
})

describe('describeLayoutErrors with locales', () => {
  it('names the locale of a translation problem', async () => {
    const { describeLayoutErrors } = await import('./issues')
    const layout = layoutOf({ id: 'h', type: 'heading', props: { text: 'Hello' }, locales: { de: { text: '' } } })
    const errors = validateLayout(layout, blocks, { localization: { ...settings, fallback: false } })
    assert.deepEqual(
      describeLayoutErrors(layout, errors, blocks).map((e) => e.message),
      ['Heading: fill in text (DE)', 'Heading: fill in text (FR)'],
    )
  })
})
