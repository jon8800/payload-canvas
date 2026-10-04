// What the canvas insert picker offers at a spot: the block types and sections that fit there
// (slot `allow` / `disallow` rules), filtered by the search text. Pure: no DOM, no React.

import { slotAcceptsAt } from '../../../core/blocks'
import type { BlockDefinition, Layout, SectionDefinition } from '../../../core/types'

export type PickerItem =
  | { kind: 'block'; id: string; label: string; hint?: string; icon: string; type: string }
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
 * each of its top-level blocks, with everything inside, may go into the slot.
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
  const blockItems: PickerItem[] = blocks
    .map((def, order) => ({ def, order, score: matchScore(query, def.label, def.type, def.category, def.ai?.description) }))
    .filter(({ def, score }) => score !== null && slotAcceptsAt(blocks, layout, parentId, slot, def.type))
    .toSorted((a, b) => (a.score ?? 0) - (b.score ?? 0) || rank(a.def.category) - rank(b.def.category) || a.order - b.order)
    .map(({ def }) => ({ kind: 'block', id: `block:${def.type}`, label: def.label, hint: def.category, icon: def.icon ?? def.type, type: def.type }))
  const sectionItems: PickerItem[] = args.sections
    .map((s, order) => ({ s, order, score: matchScore(query, s.label, s.description, s.category, s.savedId === undefined ? undefined : 'saved') }))
    .filter(({ s, score }) => score !== null && s.blocks.length > 0)
    .filter(({ s }) => s.blocks.every((block) => slotAcceptsAt(blocks, layout, parentId, slot, block)))
    .toSorted(
      (a, b) =>
        (a.score ?? 0) - (b.score ?? 0) || Number(a.s.savedId === undefined) - Number(b.s.savedId === undefined) || a.order - b.order,
    )
    .map(({ s }) => ({
      kind: 'section',
      id: `section:${s.id}`,
      label: s.label,
      hint: s.savedId === undefined ? s.category : s.category ? `Saved · ${s.category}` : 'Saved',
      icon: 'section',
      section: s,
    }))
  return [...blockItems, ...sectionItems]
}
