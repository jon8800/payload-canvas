import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field, FieldHook } from 'payload'

import { captureFieldSemantics } from '../core/fieldSemantics'
import type { Block, BlockDefinition, SectionDefinition } from '../core/types'
import { FIELD_REGISTRY_KEY } from '../live/fieldChecks'
import {
  findSection,
  savedSectionData,
  savedSectionsCollection,
  savedSectionsConfigOf,
  SAVED_SECTIONS_CONFIG_KEY,
  toSavedSection,
} from './sections'

const block: Block = { id: 'b1', type: 'stack', slots: { children: [{ id: 'b2', type: 'heading', props: { text: 'Hi' } }] } }

describe('toSavedSection', () => {
  it('turns a document into a section with a saved: id', () => {
    assert.deepEqual(toSavedSection({ id: 12, name: '  Team   intro ', category: 'Team', blocks: [block] }), {
      id: 'saved:12',
      label: 'Team intro',
      category: 'Team',
      blocks: [block],
      savedId: 12,
    })
  })

  it('falls back to a default name and leaves out an empty category', () => {
    const section = toSavedSection({ id: 'a1', name: ' ', category: '', blocks: [block] })
    assert.equal(section?.label, 'Untitled section')
    assert.equal(section && 'category' in section, false)
  })

  it('returns null without an id or without blocks', () => {
    assert.equal(toSavedSection({ name: 'X', blocks: [block] }), null)
    assert.equal(toSavedSection({ id: 1, name: 'X', blocks: [] }), null)
    assert.equal(toSavedSection({ id: 1, name: 'X', blocks: 'nope' }), null)
  })

  it('stores blocks in canonical form', () => {
    const section = toSavedSection({ id: 1, name: 'X', blocks: [{ id: 'c', type: 'stack', props: {}, slots: { children: [] } }] })
    assert.deepEqual(section?.blocks, [{ id: 'c', type: 'stack' }])
  })
})

describe('savedSectionData', () => {
  it('trims the name and category and keeps the block ids', () => {
    assert.deepEqual(savedSectionData(block, '  Hero  ', ' Heroes '), { name: 'Hero', category: 'Heroes', blocks: [block] })
  })

  it('uses the fallback name and a null category', () => {
    assert.deepEqual(savedSectionData(block, '', null, 'Stack'), { name: 'Stack', category: null, blocks: [block] })
    assert.equal(savedSectionData(block, '   ').name, 'Untitled section')
  })

  it('cuts long names and categories', () => {
    const data = savedSectionData(block, 'n'.repeat(500), 'c'.repeat(500))
    assert.equal(data.name.length, 120)
    assert.equal(data.category?.length, 60)
  })
})

describe('findSection', () => {
  const hero: SectionDefinition = { id: 'hero', label: 'Hero', blocks: [block] }
  const saved: SectionDefinition = { id: 'saved:12', label: 'Team Intro', blocks: [block], savedId: 12 }
  const named: SectionDefinition = { id: 'saved:13', label: 'hero', blocks: [block], savedId: 13 }
  const sections = [hero, saved, named]

  it('finds by id, saved id or document id', () => {
    assert.equal(findSection(sections, 'hero'), hero)
    assert.equal(findSection(sections, 'saved:12'), saved)
    assert.equal(findSection(sections, ' 12 '), saved)
  })

  it('finds by name, case-insensitive', () => {
    assert.equal(findSection(sections, 'team intro'), saved)
  })

  it('prefers ids over names', () => {
    assert.equal(findSection([named, hero], 'hero'), hero)
  })

  it('returns undefined for an empty or unknown ref', () => {
    assert.equal(findSection(sections, ''), undefined)
    assert.equal(findSection(sections, 'saved:99'), undefined)
  })
})

describe('savedSectionsConfigOf', () => {
  it('reads the slug from config.custom', () => {
    assert.deepEqual(savedSectionsConfigOf({ config: { custom: { [SAVED_SECTIONS_CONFIG_KEY]: { slug: 'builder-sections' } } } }), {
      slug: 'builder-sections',
    })
    assert.equal(savedSectionsConfigOf({ config: {} }), null)
  })
})

describe('saved sections run the field logic of block props', () => {
  type Args = Record<string, unknown>
  const calls: Args[] = []
  const blocks: BlockDefinition[] = [
    { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
    {
      type: 'product',
      label: 'Product',
      fields: [
        {
          name: 'title',
          type: 'text',
          hooks: { beforeValidate: [({ value }: Args) => (typeof value === 'string' ? value.trim() : value)] },
        },
        {
          name: 'slug',
          type: 'text',
          hooks: {
            beforeChange: [
              (args: Args) => {
                calls.push(args)
                const title = (args.siblingData as Args).title
                return typeof title === 'string' ? title.toLowerCase().replace(/\s+/g, '-') : args.value
              },
            ],
          },
        },
        { name: 'sku', type: 'text', required: true, validate: (value: unknown) => (value === 'bad' ? 'SKU must not be "bad".' : true) },
      ] as unknown as Field[],
    },
  ]
  const registry = captureFieldSemantics(blocks)
  const collection = savedSectionsCollection({ slug: 'builder-sections', blocks })
  const field = collection.fields.find((f) => 'name' in f && f.name === 'blocks') as { hooks: { beforeValidate: FieldHook[] } }
  const hook = field.hooks.beforeValidate[0]

  function run(value: unknown, extra: Args = {}) {
    const logs: string[] = []
    const req = {
      user: { id: 1 },
      t: (key: string) => key,
      payload: { config: { custom: { [FIELD_REGISTRY_KEY]: registry } }, logger: { warn: (message: string) => logs.push(message) } },
    }
    const result = (hook as unknown as (args: Args) => Promise<unknown>)({ value, req, collection: null, context: {}, operation: 'create', data: {}, ...extra })
    return { result, logs }
  }

  const section = (props: Args): Block[] => [{ id: 's', type: 'stack', slots: { children: [{ id: 'p', type: 'product', props }] } }]

  it('runs beforeValidate, then beforeChange hooks, also on nested blocks', async () => {
    calls.length = 0
    const { result, logs } = run(section({ title: '  Red Shoe ', sku: 'A1' }))
    assert.deepEqual(await result, [{ id: 's', type: 'stack', slots: { children: [{ id: 'p', type: 'product', props: { title: 'Red Shoe', slug: 'red-shoe', sku: 'A1' } }] } }])
    assert.deepEqual(logs, [])
    // Payload's path, below the section's `blocks` field.
    assert.equal((calls[0].path as unknown[])[0], 'blocks')
    assert.equal((calls[0].path as unknown[]).at(-1), 'slug')
    assert.equal(calls[0].operation, 'create')
  })

  it('passes the saved section as previousValue on update', async () => {
    calls.length = 0
    const originalDoc = { id: 7, name: 'Old', blocks: section({ title: 'Old', slug: 'old', sku: 'A1' }) }
    await run(section({ title: 'New', sku: 'A1' }), { operation: 'update', originalDoc }).result
    assert.equal(calls[0].previousValue, 'old')
    assert.equal(calls[0].operation, 'update')
  })

  it('logs validate messages and publish-only problems as warnings, without blocking', async () => {
    const { result, logs } = run(section({ title: 'X', sku: 'bad' }))
    assert.equal(((await result) as Block[]).length, 1)
    assert.equal(logs.length, 1)
    assert.match(logs[0], /Product: Sku: SKU must not be "bad"\./)
    const missing = run(section({ title: 'X' }))
    await missing.result
    assert.match(missing.logs[0], /Product: fill in sku/)
  })

  it('leaves a damaged section to the field validation, without running hooks', async () => {
    calls.length = 0
    const damaged = [{ id: 'p', type: 'product', props: { title: 5 } }]
    assert.deepEqual(await run(damaged).result, damaged)
    assert.equal(calls.length, 0)
  })
})
