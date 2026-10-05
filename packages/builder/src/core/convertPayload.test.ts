import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fromPayloadBlocks } from '../blocks/payload'
import { flatBlocks, twoLevelConfigBlocks } from '../blocks/payloadFixtures.test-data'
import { convertLocalizedPayloadBlocks, convertPayloadBlocksLayout, payloadFieldIsLocalized, toPayloadBlock, withFieldDefaults } from './convertPayload'
import { validateLayout } from './validate'

const quiet = { onWarning: false as const }
const twoLevel = fromPayloadBlocks(twoLevelConfigBlocks, { ...quiet, root: ['fullWidth', 'twoColumn'] })
const flat = fromPayloadBlocks(flatBlocks, quiet)

const lexical = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] }] } }

/** Payload data as `find({ depth: 0 })` returns it from a blocksAsJSON column. */
const twoLevelData = [
  {
    id: '65f0a1',
    blockType: 'fullWidth',
    blockName: null,
    bordered: false,
    backgroundImage: null,
    paddingTop: 'large',
    paddingBottom: 'default',
    content: [
      { id: '65f0a2', blockType: 'heading', blockName: 'Intro title', eyebrow: null, text: 'Welcome', level: 'h2' },
      { id: '65f0a3', blockType: 'richText', content: lexical },
    ],
  },
  {
    id: '65f0b1',
    blockType: 'twoColumn',
    columnRatio: '67-33',
    leftColumn: [{ id: '65f0b2', blockType: 'image', image: 7, caption: 'A', overlayButton: { label: null, link: { type: 'custom', url: '/x', label: 'Go' } } }],
    rightColumn: [
      { id: '65f0b3', blockType: 'button', link: { type: 'reference', reference: { relationTo: 'pages', value: 3 }, label: 'Read' }, variant: 'outline' },
      { id: '65f0b4', blockType: 'oldPromo', title: 'Gone' },
    ],
  },
  { id: '65f0c1', blockType: 'oldPromo', title: 'Gone too' },
]

describe('convertPayloadBlocksLayout', () => {
  it('converts a two-level layout: sections, slots, props, labels and ids', () => {
    const { layout, report, alreadyLayout } = convertPayloadBlocksLayout(twoLevelData, twoLevel)
    assert.equal(alreadyLayout, false)
    assert.deepEqual(layout, {
      version: 1,
      blocks: [
        {
          id: '65f0a1',
          type: 'fullWidth',
          props: { bordered: false, paddingTop: 'large', paddingBottom: 'default' },
          slots: {
            content: [
              { id: '65f0a2', type: 'heading', props: { text: 'Welcome', level: 'h2' }, label: 'Intro title' },
              { id: '65f0a3', type: 'richText', props: { content: lexical } },
            ],
          },
        },
        {
          id: '65f0b1',
          type: 'twoColumn',
          props: { columnRatio: '67-33' },
          slots: {
            leftColumn: [{ id: '65f0b2', type: 'image', props: { image: 7, caption: 'A', overlayButton: { label: null, link: { type: 'custom', url: '/x', label: 'Go' } } } }],
            rightColumn: [
              { id: '65f0b3', type: 'button', props: { link: { type: 'reference', reference: { relationTo: 'pages', value: 3 }, label: 'Read' }, variant: 'outline' } },
            ],
          },
        },
      ],
    })
    assert.equal(report.blocks, 6)
    assert.deepEqual(report.unknownTypes, { oldPromo: 2 })
    assert.deepEqual(report.droppedFields, {})
    assert.deepEqual(validateLayout(layout, twoLevel), [])
  })

  it('converts a flat layout with arrays, groups and uploads', () => {
    const data = [
      { id: 'a', blockType: 'sectionIntro', heading: 'Hi', paragraphs: [{ id: 'p1', text: 'One' }, { id: 'p2', text: null }] },
      { id: 'b', blockType: 'testimonials', heading: 'Guests', rating: { score: 4, source: null }, testimonials: [{ id: 't', quote: 'Great', photo: 12 }] },
    ]
    const { layout, report } = convertPayloadBlocksLayout(data, flat)
    assert.deepEqual(layout.blocks[1], {
      id: 'b',
      type: 'testimonials',
      props: { heading: 'Guests', rating: { score: 4, source: null }, testimonials: [{ id: 't', quote: 'Great', photo: 12 }] },
    })
    assert.equal(report.blocks, 2)
    assert.deepEqual(validateLayout(layout, flat), [])
  })

  it('reduces populated uploads and relationships to IDs', () => {
    const data = [
      {
        id: 'b',
        blockType: 'testimonials',
        heading: 'Guests',
        testimonials: [{ id: 't', quote: 'Great', photo: { id: 12, url: '/media/a.jpg' } }],
      },
      { id: 'c', blockType: 'button', link: { type: 'reference', reference: { relationTo: 'pages', value: { id: 3, slug: 'about' } }, label: 'Go' } },
    ]
    const { layout } = convertPayloadBlocksLayout(data, [...flat, ...twoLevel])
    assert.deepEqual((layout.blocks[0].props!.testimonials as Array<{ photo: unknown }>)[0].photo, 12)
    assert.deepEqual((layout.blocks[1].props!.link as { reference: unknown }).reference, { relationTo: 'pages', value: 3 })
  })

  it('reports fields that are not in the definition and leaves them out', () => {
    const { layout, report } = convertPayloadBlocksLayout([{ id: 'h', blockType: 'heading', text: 'Hi', accentWords: 'Hi', size: null }], twoLevel)
    assert.deepEqual(layout.blocks[0].props, { text: 'Hi' })
    assert.deepEqual(report.droppedFields, { heading: ['accentWords'] })
  })

  it('maps blockType through `payload.slug` when the types have a prefix', () => {
    const prefixed = fromPayloadBlocks(twoLevelConfigBlocks, { ...quiet, prefix: 'site' })
    const { layout } = convertPayloadBlocksLayout(twoLevelData.slice(0, 1), prefixed)
    assert.equal(layout.blocks[0].type, 'siteFullWidth')
    assert.equal(layout.blocks[0].slots?.content[0].type, 'siteHeading')
  })

  it('gives new ids to missing or duplicate ids', () => {
    const { layout } = convertPayloadBlocksLayout(
      [
        { blockType: 'heading', text: 'A' },
        { id: 'x', blockType: 'heading', text: 'B' },
        { id: 'x', blockType: 'heading', text: 'C' },
      ],
      twoLevel,
    )
    const ids = layout.blocks.map((b) => b.id)
    assert.equal(new Set(ids).size, 3)
    assert.equal(ids[1], 'x')
  })

  it('is idempotent: a converted layout converts to itself', () => {
    const first = convertPayloadBlocksLayout(twoLevelData, twoLevel)
    const second = convertPayloadBlocksLayout(first.layout, twoLevel)
    assert.equal(second.alreadyLayout, true)
    assert.deepEqual(second.layout, first.layout)
    assert.equal(second.report.blocks, first.report.blocks)
  })

  it('handles empty and broken values', () => {
    for (const value of [null, undefined, [], 'text', {}, [null, 3, { blockType: '' }]]) {
      assert.deepEqual(convertPayloadBlocksLayout(value, twoLevel).layout, { version: 1, blocks: [] })
    }
  })

  it('keeps unknown blocks only when asked', () => {
    const { layout } = convertPayloadBlocksLayout([{ id: 'o', blockType: 'oldPromo', title: 'Gone' }], twoLevel, { keepUnknown: true })
    assert.deepEqual(layout.blocks, [{ id: 'o', type: 'oldPromo', props: { title: 'Gone' } }])
  })
})

describe('toPayloadBlock', () => {
  it('turns a builder block back into Payload shape with nested slots and defaults', () => {
    const { layout } = convertPayloadBlocksLayout(twoLevelData, twoLevel)
    const section = toPayloadBlock(layout.blocks[0], twoLevel)
    assert.equal(section.blockType, 'fullWidth')
    assert.equal(section.id, '65f0a1')
    assert.equal(section.paddingTop, 'large')
    const content = section.content as Array<Record<string, unknown>>
    assert.equal(content[0].blockType, 'heading')
    assert.equal(content[0].blockName, 'Intro title')
    assert.equal(content[0].text, 'Welcome')
  })

  it('uses the Payload slug, fills defaults and leaves hidden children out', () => {
    const prefixed = fromPayloadBlocks(twoLevelConfigBlocks, { ...quiet, prefix: 'site' })
    const block = {
      id: 's',
      type: 'siteTwoColumn',
      slots: { leftColumn: [{ id: 'a', type: 'siteHeading', props: { text: 'A' } }, { id: 'b', type: 'siteHeading', hidden: true }] },
    }
    const data = toPayloadBlock(block, prefixed)
    assert.equal(data.blockType, 'twoColumn')
    assert.equal(data.columnRatio, '50-50')
    assert.deepEqual(data.rightColumn, [])
    const left = data.leftColumn as Array<Record<string, unknown>>
    assert.equal(left.length, 1)
    assert.equal(left[0].blockType, 'heading')
    assert.equal(left[0].level, 'h2')
  })
})

describe('withFieldDefaults', () => {
  it('fills missing values, inside named groups too, and keeps the object when nothing is missing', () => {
    const fields = flatBlocks[1].fields
    assert.deepEqual(withFieldDefaults({ heading: 'x' }, fields), { heading: 'x', rating: { score: 5, source: 'Google Reviews' } })
    const full = { heading: 'x', rating: { score: 1, source: 'y' } }
    assert.equal(withFieldDefaults(full, fields), full)
  })
})

describe('convertLocalizedPayloadBlocks', () => {
  const note = { slug: 'note', fields: [{ name: 'text', type: 'text', localized: true }] }
  // A section whose nested blocks field (a slot) is localized: each locale has its own children.
  const section = { slug: 'section', fields: [{ name: 'items', type: 'blocks', localized: true, blocks: ['note'] }] }
  const references = { note, section }
  const defs = fromPayloadBlocks([section, note] as never, quiet)
  const settings = { locales: ['en', 'de'], defaultLocale: 'en', fallback: true }
  const field = { name: 'layout', type: 'blocks', blockReferences: ['section'] }

  it('finds localized fields at any depth, through block references', () => {
    assert.equal(payloadFieldIsLocalized(field, references), true)
    assert.equal(payloadFieldIsLocalized({ name: 'layout', type: 'blocks', blocks: [{ slug: 'x', fields: [{ name: 'a', type: 'text' }] }] }), false)
  })

  it('matches the children of a localized slot and reports the rest', () => {
    const value = [
      {
        id: 's1',
        blockType: 'section',
        items: {
          en: [
            { id: 'n1', blockType: 'note', text: 'One' },
            { id: 'n2', blockType: 'note', text: 'Two' },
          ],
          de: [
            { id: 'n2', blockType: 'note', text: 'Zwei' },
            { id: 'x1', blockType: 'note', text: 'Extra' },
          ],
        },
      },
    ]
    const { layout, report } = convertLocalizedPayloadBlocks(value, { field, references }, defs, settings)
    assert.deepEqual(layout.blocks, [
      {
        id: 's1',
        type: 'section',
        slots: {
          items: [
            { id: 'n1', type: 'note', props: { text: 'One' } },
            { id: 'n2', type: 'note', props: { text: 'Two' }, locales: { de: { text: 'Zwei' } } },
          ],
        },
      },
    ])
    // n1 (position 0) has no German block of its type left: x1 sits at position 1.
    assert.deepEqual(report.unmatched, [{ locale: 'de', id: 'x1', blockType: 'note' }])
    assert.equal(report.blocks, 3)
  })
})
