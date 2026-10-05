import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { blockJsonSchema, getBlockDefinition, validateLayout } from '../core'
import { defaultBlocks } from './defaults'
import { fromPayloadBlocks } from './payload'
import { flatBlocks, fullWidth, twoLevelConfigBlocks } from './payloadFixtures.test-data'

const quiet = { onWarning: false as const }

function field(fields: readonly unknown[], name: string): Record<string, unknown> | undefined {
  for (const f of fields as Array<Record<string, unknown>>) {
    if (f.name === name) return f
    const nested = [
      ...((f.fields as unknown[]) ?? []),
      ...(((f.tabs as Array<{ fields?: unknown[]; name?: string }>) ?? []).filter((t) => !t.name).flatMap((t) => t.fields ?? [])),
    ]
    const found = field(nested, name)
    if (found) return found
  }
  return undefined
}

describe('fromPayloadBlocks: two-level site with blockReferences', () => {
  const blocks = fromPayloadBlocks(twoLevelConfigBlocks, { ...quiet, root: ['fullWidth', 'twoColumn'] })
  const full = getBlockDefinition(blocks, 'fullWidth')
  const two = getBlockDefinition(blocks, 'twoColumn')

  it('makes one definition per block, in order, with the Payload slug', () => {
    assert.deepEqual(
      blocks.map((b) => b.type),
      ['fullWidth', 'twoColumn', 'heading', 'richText', 'image', 'button', 'faqAccordion'],
    )
    for (const b of blocks) assert.deepEqual(b.payload, { slug: b.type })
  })

  it('turns nested blocks fields into slots that allow the referenced blocks', () => {
    assert.deepEqual(full?.slots, { content: { allow: ['heading', 'richText', 'image', 'button', 'faqAccordion'] } })
    assert.deepEqual(Object.keys(two?.slots ?? {}), ['leftColumn', 'rightColumn'])
    assert.equal(two?.slots?.leftColumn.label, 'Left column')
  })

  it('removes the slot fields and the tabs left empty', () => {
    assert.equal(field(full?.fields ?? [], 'content'), undefined)
    const tabs = (full!.fields[0] as { tabs: Array<{ label: string }> }).tabs
    assert.deepEqual(tabs.map((t) => t.label), ['Design'])
    assert.ok(field(full?.fields ?? [], 'paddingTop'))
  })

  it('takes labels, groups and icons from the config', () => {
    assert.equal(full?.label, 'Full Width Section')
    assert.equal(full?.category, 'Sections')
    assert.equal(full?.icon, 'section')
    assert.equal(two?.category, 'Site sections')
    assert.equal(getBlockDefinition(blocks, 'heading')?.category, 'Site blocks')
    assert.equal(getBlockDefinition(blocks, 'heading')?.icon, 'heading')
    assert.equal(getBlockDefinition(blocks, 'image')?.icon, 'image')
    assert.equal(full?.styles, false)
  })

  it('limits leaves to the sections that take them when `root` is set', () => {
    assert.equal(full?.parents, undefined)
    assert.deepEqual(getBlockDefinition(blocks, 'heading')?.parents, ['fullWidth', 'twoColumn'])
  })

  it('turns sibling conditions into JSON conditions', () => {
    const button = getBlockDefinition(blocks, 'button')
    const url = field(button?.fields ?? [], 'url') as { admin: { custom: unknown; condition?: unknown } }
    assert.deepEqual(url.admin.custom, { builderCondition: { field: 'type', equals: 'custom' } })
    assert.equal(url.admin.condition, undefined)
    const faqs = field(getBlockDefinition(blocks, 'faqAccordion')?.fields ?? [], 'faqs') as { admin: { custom: unknown } }
    assert.deepEqual(faqs.admin.custom, { builderCondition: { field: 'source', equals: 'manual' } })
  })

  it('reports custom admin components and conditions it cannot read', () => {
    const messages: string[] = []
    fromPayloadBlocks(twoLevelConfigBlocks, { onWarning: (m) => messages.push(m) })
    assert.ok(messages.some((m) => m.includes('"heading"') && m.includes('text: custom admin Field')))
    assert.ok(messages.some((m) => m.includes('"faqAccordion"') && m.includes('category: admin.condition')))
  })

  it('keeps the definitions JSON-safe after functions are dropped', () => {
    const json = JSON.parse(JSON.stringify(blocks))
    assert.deepEqual(json[0].slots, full?.slots)
  })

  it('applies prefix and overrides', () => {
    const prefixed = fromPayloadBlocks(twoLevelConfigBlocks, {
      ...quiet,
      prefix: 'site',
      overrides: { fullWidth: { styles: true, category: 'Layout', slots: { content: { allow: ['*'] } } } },
    })
    const section = getBlockDefinition(prefixed, 'siteFullWidth')
    assert.equal(section?.payload?.slug, 'fullWidth')
    assert.deepEqual(section?.slots?.content.allow, ['*'])
    assert.equal(section?.styles, true)
    assert.equal(section?.category, 'Layout')
    assert.deepEqual(getBlockDefinition(prefixed, 'siteTwoColumn')?.slots?.rightColumn.allow?.slice(0, 2), ['siteHeading', 'siteRichText'])
    // No clash with the default blocks.
    const types = [...defaultBlocks(), ...prefixed].map((b) => b.type)
    assert.equal(new Set(types).size, types.length)
  })

  it('resolves blockReferences from `references`', () => {
    const only = fromPayloadBlocks([fullWidth], { ...quiet, references: twoLevelConfigBlocks })
    assert.deepEqual(
      only.map((b) => b.type),
      ['fullWidth', 'heading', 'richText', 'image', 'button', 'faqAccordion'],
    )
  })

  it('validates converted layouts with the generated schema', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 's',
          type: 'fullWidth',
          props: { paddingTop: 'large' },
          slots: { content: [{ id: 'h', type: 'heading', props: { text: 'Hi', level: 'h3' } }] },
        },
      ],
    }
    assert.deepEqual(validateLayout(layout, blocks), [])
    assert.equal((blockJsonSchema(full!, blocks) as { title: string }).title, 'Full Width Section')
  })

  it('does not require a field its condition hides', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 's', type: 'fullWidth', slots: { content: [{ id: 'b', type: 'button', props: { link: { type: 'reference', label: 'Go' } } }] } }],
    }
    assert.deepEqual(validateLayout(layout, blocks).filter((e) => e.code === 'required'), [])
    const custom = { ...layout, blocks: [{ ...layout.blocks[0], slots: { content: [{ id: 'b', type: 'button', props: { link: { type: 'custom', label: 'Go' } } }] } }] }
    assert.equal(validateLayout(custom, blocks).filter((e) => e.code === 'required').length, 1)
  })
})

describe('fromPayloadBlocks: flat site with inline blocks', () => {
  const blocks = fromPayloadBlocks(flatBlocks, quiet)

  it('keeps arrays, groups and uploads as props, with no slots', () => {
    assert.deepEqual(blocks.map((b) => b.type), ['sectionIntro', 'testimonials', 'cardGrid'])
    for (const b of blocks) assert.equal(b.slots, undefined)
    assert.equal(field(getBlockDefinition(blocks, 'testimonials')?.fields ?? [], 'rating')?.type, 'group')
  })

  it('keeps a blocks field inside an array as a prop and reports it', () => {
    const messages: string[] = []
    const defs = fromPayloadBlocks(flatBlocks, { onWarning: (m) => messages.push(m) })
    const cards = field(getBlockDefinition(defs, 'cardGrid')?.fields ?? [], 'cards') as { fields: Array<{ name: string; type: string }> }
    assert.equal(cards.fields[1].type, 'blocks')
    assert.ok(messages.some((m) => m.includes('cards[].body')))
    const layout = { version: 1, blocks: [{ id: 'c', type: 'cardGrid', props: { cards: [{ id: 'r', title: 'A', body: [{ blockType: 'note', text: 'x' }] }] } }] }
    assert.deepEqual(validateLayout(layout, defs), [])
  })

  it('inline blocks inside a slot become definitions too', () => {
    const defs = fromPayloadBlocks(
      [{ slug: 'section', fields: [{ name: 'items', type: 'blocks', blocks: [{ slug: 'item', fields: [{ name: 'text', type: 'text' }] }] }] }],
      quiet,
    )
    assert.deepEqual(defs.map((b) => b.type), ['section', 'item'])
    assert.deepEqual(defs[0].slots, { items: { allow: ['item'] } })
  })

  it('carries maxRows and minRows over as slot max and min', () => {
    const heading = { slug: 'heading', fields: [{ name: 'text', type: 'text' as const }] }
    const defs = fromPayloadBlocks(
      [
        {
          slug: 'ctaContact',
          fields: [
            { name: 'headingBlock', type: 'blocks', maxRows: 1, blocks: [heading] },
            { name: 'cards', type: 'blocks', minRows: 2, maxRows: 4, blocks: [heading] },
          ],
        },
      ],
      quiet,
    )
    assert.deepEqual(defs[0].slots, { headingBlock: { allow: ['heading'], max: 1 }, cards: { allow: ['heading'], max: 4, min: 2 } })
  })
})
