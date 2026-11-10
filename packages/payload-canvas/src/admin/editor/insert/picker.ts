// What the canvas insert picker offers at a spot: the block types and sections that fit there
// (slot `allow` / `disallow` / `max` rules), filtered by the search text. Pure: no DOM, no React.

import { getBlockDefinition, slotAcceptsAt, slotDefinitionAt, slotRoom } from '../../../core/blocks'
import { sectionVersion, sectionVersions } from '../../../core/sections'
import type { BlockDefinition, Layout, SectionDefinition, SlotDefinition } from '../../../core/types'

export type PickerItem =
  | { kind: 'block'; id: string; label: string; hint?: string; icon: string; type: string; template?: SlotDefinition['newBlock'] }
  | { kind: 'section'; id: string; label: string; hint?: string; icon: string; section: SectionDefinition }

/** Block categories in library order. Others follow A–Z. */
export const BLOCK_ORDER = ['Layout', 'Content', 'Media', 'Interactive', 'Dynamic']

/**
 * How well an item matches the search: 0 its name starts with it, 1 its name contains it, 2 another
 * text (type, category, description) contains it. Null: no match. Every item matches an empty search.
 */
export function matchScore(query: string, label: string, ...texts: (string | undefined)[]): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const name = label.toLowerCase()
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  return texts.some((text) => text?.toLowerCase().includes(q)) ? 2 : null
}

const rank = (category: string | undefined) => {
  const i = BLOCK_ORDER.indexOf(category ?? '')
  return i === -1 ? BLOCK_ORDER.length : i
}

/**
 * The picker's items for a position: blocks first, then sections. Within each, the best name
 * matches come first; then blocks go by category and sections saved-first. A section fits when
 * each of its top-level blocks, with everything inside, may go into the slot, and the slot has room
 * for all of them (`max`). A section with variants is one item: it inserts the section's own
 * version (its root block remembers the section, so the canvas offers the other versions), and
 * its hint counts the versions. A slot with a `newBlock` (a carousel's "Slide") lists it first.
 */
export function pickerItems(args: {
  blocks: BlockDefinition[]
  sections: SectionDefinition[]
  layout: Layout
  parentId: string | null
  slot: string
  query: string
}): PickerItem[] {
  const { blocks, layout, parentId, slot, query } = args
  const room = slotRoom(blocks, layout, parentId, slot)
  const blockItems: PickerItem[] = blocks
    .map((def, order) => ({ def, order, score: matchScore(query, def.label, def.type, def.category, def.ai?.description) }))
    .filter(({ def, score }) => score !== null && slotAcceptsAt(blocks, layout, parentId, slot, def.type))
    .toSorted((a, b) => (a.score ?? 0) - (b.score ?? 0) || rank(a.def.category) - rank(b.def.category) || a.order - b.order)
    .map(({ def }) => ({ kind: 'block', id: `block:${def.type}`, label: def.label, hint: def.category, icon: def.icon ?? def.type, type: def.type }))
  const sectionItems: PickerItem[] = args.sections
    .map((s, order) => ({ s, order, score: matchScore(query, s.label, s.description, s.category, s.savedId === undefined ? undefined : 'saved', ...(s.variants ?? []).map((v) => v.label)) }))
    .filter(({ s, score }) => score !== null && s.blocks.length > 0)
    .filter(({ s }) => s.blocks.length <= room && s.blocks.every((block) => slotAcceptsAt(blocks, layout, parentId, slot, block)))
    .toSorted(
      (a, b) =>
        (a.score ?? 0) - (b.score ?? 0) || Number(a.s.savedId === undefined) - Number(b.s.savedId === undefined) || a.order - b.order,
    )
    .map(({ s }) => {
      const count = sectionVersions(s).length
      const versions = count > 1 ? `${count} versions` : undefined
      return {
        kind: 'section',
        id: `section:${s.id}`,
        label: s.label,
        hint: s.savedId === undefined ? [s.category, versions].filter(Boolean).join(' · ') || undefined : s.category ? `Saved · ${s.category}` : 'Saved',
        icon: 'section',
        section: sectionVersion(s) ?? s,
      }
    })
  // The slot's own new block (a carousel's "Slide") comes first.
  const template = slotDefinitionAt(blocks, layout, parentId, slot)?.newBlock
  const templateDef = template ? getBlockDefinition(blocks, template.type) : undefined
  const own: PickerItem[] =
    template && templateDef && slotAcceptsAt(blocks, layout, parentId, slot, template.type) && matchScore(query, template.label ?? templateDef.label, templateDef.label) !== null
      ? [{ kind: 'block', id: `new:${slot}`, label: template.label ?? templateDef.label, hint: templateDef.label, icon: templateDef.icon ?? templateDef.type, type: template.type, template }]
      : []
  return [...own, ...blockItems, ...sectionItems]
}
