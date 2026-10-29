import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defineSection } from './blocks'
import { applyOperations } from './operations'
import { blockJsonSchema } from './schema'
import {
  findSectionVersion,
  listedVariants,
  sectionVersion,
  sectionVersions,
  switchSectionVariant,
  versionIndex,
  withoutSectionOrigin,
} from './sections'
import { normalizeLayout } from './tree'
import type { Block, BlockDefinition, Layout, SectionDefinition } from './types'
import { validateLayout } from './validate'

const defs: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'grid', label: 'Grid', fields: [], slots: { children: {} } },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] },
  { type: 'text', label: 'Text', fields: [{ name: 'text', type: 'text', localized: true }] },
  { type: 'image', label: 'Image', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] },
]

const hero = defineSection({
  id: 'hero',
  label: 'Hero',
  category: 'Heroes',
  description: 'Big title',
  blocks: [
    {
      type: 'stack',
      label: 'Hero',
      className: 'flex flex-col',
      slots: { children: [{ type: 'heading', props: { text: 'Welcome' } }, { type: 'text', props: { text: 'Intro' } }] },
    },
  ],
  variants: [
    {
      id: 'split',
      label: 'Split',
      blocks: [
        {
          type: 'grid',
          label: 'Hero',
          className: 'grid grid-cols-2',
          slots: {
            children: [
              { type: 'stack', slots: { children: [{ type: 'heading', props: { text: 'Hello' } }, { type: 'text', props: { text: 'Split intro' } }] } },
              { type: 'image', props: { image: 7 } },
            ],
          },
        },
      ],
    },
    { id: 'dark', label: 'Dark', description: 'On black', blocks: [{ type: 'stack', className: 'bg-black', slots: { children: [{ type: 'heading', props: { text: 'Dark' } }] } }] },
  ],
})

const cta: SectionDefinition = { id: 'cta', label: 'Call to action', blocks: [{ id: 'c1', type: 'heading' }, { id: 'c2', type: 'text' }] }
const saved: SectionDefinition = { id: 'saved:4', savedId: 4, label: 'Mine', blocks: [{ id: 's1', type: 'heading' }], variants: hero.variants }

/** A counter for predictable new ids. */
const ids = () => {
  let n = 0
  return () => `n${++n}`
}

/** Inserts the version like the editor does: new ids for every block. */
function inserted(section: SectionDefinition, variant?: string): Block {
  const version = sectionVersion(section, variant)!
  const next = ids()
  const reId = (block: Block): Block => ({
    ...structuredClone(block),
    id: `p_${next()}`,
    ...(block.slots ? { slots: Object.fromEntries(Object.entries(block.slots).map(([n, l]) => [n, l.map(reId)])) } : {}),
  })
  return reId(version.blocks[0]!)
}

const page = (...blocks: Block[]): Layout => ({ version: 1, blocks })
const texts = (block: Block): string[] => [
  ...(typeof block.props?.text === 'string' ? [block.props.text] : []),
  ...Object.values(block.slots ?? {}).flatMap((list) => list.flatMap(texts)),
]

describe('section versions', () => {
  it('lists the section first, then its variants; saved sections have none', () => {
    assert.deepEqual(sectionVersions(hero).map((v) => [v.variant, v.label, v.description]), [
      [undefined, 'Default', 'Big title'],
      ['split', 'Split', 'Big title'],
      ['dark', 'Dark', 'On black'],
    ])
    assert.equal(sectionVersions({ ...hero, variantLabel: 'Centred' })[0]!.label, 'Centred')
    assert.equal(sectionVersions(saved).length, 1)
    assert.equal(versionIndex(hero, 'dark'), 2)
    assert.equal(versionIndex(hero, null), 0)
    assert.equal(versionIndex(hero, 'nope'), -1)
  })

  it('a version to insert stamps its root block with the section and the variant', () => {
    const split = sectionVersion(hero, 'split')!
    assert.equal(split.label, 'Hero (Split)')
    assert.equal('variants' in split, false)
    assert.deepEqual(split.blocks[0]!.section, { id: 'hero', variant: 'split' })
    assert.deepEqual(sectionVersion(hero)!.blocks[0]!.section, { id: 'hero' })
    assert.equal(sectionVersion(hero, 'nope'), null)
    // Several root blocks: nothing to switch, so no stamp. Saved sections are never stamped.
    assert.deepEqual(sectionVersion(cta)!.blocks, cta.blocks)
    assert.equal(sectionVersion(saved)!.blocks[0]!.section, undefined)
  })

  it('finds a version by id and variant, the old "<id>/<variant>" id, and explains a wrong variant', () => {
    const all = [hero, cta, saved]
    assert.deepEqual((findSectionVersion(all, 'hero', 'dark') as SectionDefinition).blocks[0]!.section, { id: 'hero', variant: 'dark' })
    assert.deepEqual((findSectionVersion(all, 'hero/split') as SectionDefinition).blocks[0]!.section, { id: 'hero', variant: 'split' })
    assert.equal((findSectionVersion(all, 'Hero') as SectionDefinition).id, 'hero')
    assert.equal(findSectionVersion(all, 'nope'), undefined)
    assert.equal(findSectionVersion(all, 'hero/nope'), undefined)
    assert.match(findSectionVersion(all, 'hero', 'nope') as string, /no variant "nope".*split, dark/)
    assert.match(findSectionVersion(all, 'saved:4', 'split') as string, /Saved sections have no variants/)
  })

  it('lists variants under their section', () => {
    const listed = listedVariants(hero, (blocks) => ({ count: blocks.length }))
    assert.deepEqual(listed, [
      { id: 'split', label: 'Split', count: 1 },
      { id: 'dark', label: 'Dark', description: 'On black', count: 1 },
    ])
    assert.equal(listedVariants(cta, () => ({})), undefined)
    assert.equal(listedVariants(saved, () => ({})), undefined)
  })
})

describe('block.section in the layout', () => {
  it('normalizeLayout keeps a valid origin in canonical form and drops a bad one', () => {
    const layout = normalizeLayout({
      version: 1,
      blocks: [
        { id: 'a', type: 'stack', section: { id: ' hero ', variant: '' } },
        { id: 'b', type: 'stack', section: { id: 'hero', variant: 'split' } },
        { id: 'c', type: 'stack', section: { id: '' } },
        { id: 'd', type: 'stack', section: 'hero' },
      ],
    })
    assert.deepEqual(layout.blocks.map((b) => b.section), [{ id: 'hero' }, { id: 'hero', variant: 'split' }, undefined, undefined])
    assert.equal('section' in layout.blocks[2]!, false)
    // Not a prop of a flat (Payload-shaped) block either.
    assert.equal(normalizeLayout([{ blockType: 'stack', section: { id: 'hero' } }]).blocks[0]!.props, undefined)
  })

  it('validateLayout and insert operations check its shape', () => {
    assert.deepEqual(validateLayout(page({ id: 'a', type: 'stack', section: { id: 'hero', variant: 'split' } }), defs), [])
    const bad = validateLayout({ version: 1, blocks: [{ id: 'a', type: 'stack', section: { id: 3 } }] }, defs)
    assert.equal(bad[0]?.path, 'blocks[0].section')
    const ok = applyOperations(page(), [{ type: 'insert', block: { id: 'a', type: 'stack', section: { id: 'hero' } }, to: { parentId: null, index: 0 } }])
    assert.ok(ok.ok && ok.layout.blocks[0]!.section?.id === 'hero')
    const refused = applyOperations(page(), [{ type: 'insert', block: { id: 'a', type: 'stack', section: { id: 'hero', extra: 1 } as never }, to: { parentId: null, index: 0 } }])
    assert.ok(!refused.ok)
  })

  it('the block schema describes it for AI tools', () => {
    const schema = blockJsonSchema(defs[0]!, defs) as { properties: Record<string, { required?: string[] }> }
    assert.deepEqual(schema.properties.section?.required, ['id'])
  })

  it('a saved section forgets it', () => {
    assert.equal(withoutSectionOrigin({ id: 'a', type: 'stack', section: { id: 'hero' } }).section, undefined)
  })
})

describe('switching a section to another version', () => {
  it('replaces the blocks in place with one remove and one insert, and undo restores them', () => {
    const before = { id: 'x', type: 'text' }
    const root = inserted(hero)
    const layout = page(before, root, { id: 'y', type: 'text' })
    const result = switchSectionVariant(layout, root.id, [hero], 'split', ids())
    assert.ok(typeof result !== 'string')
    assert.deepEqual(result.ops.map((op) => op.type), ['remove', 'insert'])
    assert.equal(result.label, 'Split')
    const applied = applyOperations(layout, result.ops)
    assert.ok(applied.ok)
    assert.deepEqual(applied.layout.blocks.map((b) => b.type), ['text', 'grid', 'text'])
    assert.deepEqual(applied.layout.blocks[1]!.section, { id: 'hero', variant: 'split' })
    assert.equal(applied.layout.blocks[1]!.className, 'grid grid-cols-2')
    // Unchanged content: the new version's own texts.
    assert.deepEqual(texts(applied.layout.blocks[1]!), ['Hello', 'Split intro'])
    const undone = applyOperations(applied.layout, applied.inverse)
    assert.ok(undone.ok)
    assert.deepEqual(undone.layout, layout)
  })

  it('carries over the edited text, cleared props, a new name and the HTML id, matched by type order', () => {
    const root = inserted(hero)
    root.label = 'Welcome block'
    root.attrs = { id: 'top' }
    root.slots!.children![0]!.props = { text: 'My title' }
    root.slots!.children![1]!.props = { text: null }
    const result = switchSectionVariant(page(root), root.id, [hero], 'split', ids())
    assert.ok(typeof result !== 'string')
    const grid = result.block
    // The root blocks pair although their types differ: the section's name and anchor stay.
    assert.equal(grid.label, 'Welcome block')
    assert.deepEqual(grid.attrs, { id: 'top' })
    const stack = grid.slots!.children![0]!
    assert.equal(stack.label, undefined)
    assert.deepEqual(stack.slots!.children!.map((b) => b.props), [{ text: 'My title' }, { text: null }])
    // The image of the new version stays as it is.
    assert.deepEqual(grid.slots!.children![1]!.props, { image: 7 })
  })

  it('carries the root name and anchor when the root types match, and keeps translations only of unchanged values', () => {
    const root = inserted(hero)
    root.label = 'Welcome block'
    root.attrs = { id: 'top' }
    root.slots!.children![0]!.props = { text: 'My title' }
    // A translation of the untouched intro text.
    root.slots!.children![1]!.locales = { de: { text: 'Einleitung' } }
    const result = switchSectionVariant(page(root), root.id, [hero], 'dark', ids())
    assert.ok(typeof result !== 'string')
    assert.equal(result.block.label, 'Welcome block')
    assert.deepEqual(result.block.attrs, { id: 'top' })
    assert.equal(result.block.className, 'bg-black')
    assert.deepEqual(texts(result.block), ['My title'])
    // Back to the section's own version: the edits come along, the translation of "Intro" too.
    const back = switchSectionVariant(page(result.block), result.block.id, [hero], undefined, ids())
    assert.ok(typeof back !== 'string')
    assert.deepEqual(back.block.section, { id: 'hero' })
    assert.deepEqual(texts(back.block), ['My title', 'Intro'])
  })

  it('pairs blocks that have the same id in both versions first', () => {
    const exact = defineSection({
      id: 'promo',
      label: 'Promo',
      blocks: [{ type: 'stack', slots: { children: [{ type: 'text', props: { text: 'A' } }, { id: 'promo_body', type: 'text', props: { text: 'B' } }] } }],
      variants: [{ id: 'short', label: 'Short', blocks: [{ type: 'stack', slots: { children: [{ id: 'promo_body', type: 'text', props: { text: 'B2' } }] } }] }],
    })
    const root = inserted(exact)
    root.slots!.children![1]!.props = { text: 'My body' }
    const result = switchSectionVariant(page(root), root.id, [exact], 'short', ids())
    assert.ok(typeof result !== 'string')
    assert.deepEqual(texts(result.block), ['My body'])
  })

  it('leaves out HTML ids other blocks use, and refuses blocks that are no section', () => {
    const root = inserted(hero)
    const withAnchor: SectionDefinition = { ...hero, variants: [{ id: 'anchor', label: 'Anchor', blocks: [{ id: 'q', type: 'stack', attrs: { id: 'taken' } }] }] }
    const layout = page({ id: 'other', type: 'text', attrs: { id: 'taken' } }, root)
    const result = switchSectionVariant(layout, root.id, [withAnchor], 'anchor', ids())
    assert.ok(typeof result !== 'string')
    assert.equal(result.block.attrs, undefined)
    assert.match(switchSectionVariant(layout, 'other', [hero], 'split') as string, /not a ready-made section/)
    assert.match(switchSectionVariant(layout, root.id, [], 'split') as string, /no longer available/)
    assert.match(switchSectionVariant(layout, root.id, [hero], 'nope') as string, /no variant "nope"/)
  })

  it('works inside a slot', () => {
    const root = inserted(hero)
    const layout = page({ id: 'wrap', type: 'stack', slots: { children: [{ id: 't', type: 'text' }, root] } })
    const result = switchSectionVariant(layout, root.id, [hero], 'split', ids())
    assert.ok(typeof result !== 'string')
    const applied = applyOperations(layout, result.ops)
    assert.ok(applied.ok)
    assert.deepEqual(applied.layout.blocks[0]!.slots!.children!.map((b) => b.type), ['text', 'grid'])
  })
})
