import type { CollectionSlug } from 'payload'
import { defineBlock } from '../../core/blocks'
import { findLocation, normalizeLayout } from '../../core/tree'
import type { Block, BlockDefinition, Layout, Operation } from '../../core/types'

export const SECTION_REF_BLOCK = 'sectionRef'

/**
 * Runtime-only slot: the saved section's blocks, put there by `attachSections` (data loading).
 * Never stored. Its blocks are copies with ids prefixed by the ref's id.
 */
export const SECTION_REF_SLOT = '$section'

/** The id of the saved section a `section` prop points at: an id, or a loaded document. */
export function sectionRefId(value: unknown): string | number | null {
  if (typeof value === 'number' || (typeof value === 'string' && value)) return value
  if (value && typeof value === 'object' && 'id' in value) return sectionRefId((value as { id: unknown }).id)
  return null
}

/**
 * The saved section's blocks as a ref renders them: canonical, with each id prefixed by the ref's
 * id, so two refs to one section (or a ref on the page the section came from) never share an id.
 */
export function sectionRefBlocks(refId: string, stored: unknown): Block[] {
  const prefix = (block: Block): Block => ({
    ...block,
    id: `${refId}_${block.id}`,
    ...(block.slots
      ? { slots: Object.fromEntries(Object.entries(block.slots).map(([name, list]) => [name, list.map(prefix)])) }
      : {}),
  })
  return normalizeLayout({ version: 1, blocks: stored }).blocks.map(prefix)
}

/**
 * "Detach section": the operations that put `copies` (the section's blocks with new ids) where the
 * ref is, and remove the ref. Apply them in one `store.apply`: one undo step. Null when the ref
 * is not in the layout or there is nothing to put in.
 */
export function sectionDetachOps(layout: Layout, refId: string, copies: readonly Block[]): Operation[] | null {
  const location = findLocation(layout, refId)
  if (!location || copies.length === 0) return null
  const to = (i: number) => ({ parentId: location.parentId, slot: location.slot, index: location.index + i })
  return [...copies.map((block, i): Operation => ({ type: 'insert', block, to: to(i) })), { type: 'remove', id: refId }]
}

/**
 * A saved section, live: the page shows the section's current blocks, so a change to the section
 * shows on every page that uses it. "Detach" in the block menu replaces it with a copy. The
 * collection is the plugin's saved sections collection (`websiteBuilder({ savedSections })`).
 */
export function sectionRefBlock(collection = 'builder-sections'): BlockDefinition {
  return defineBlock({
    type: SECTION_REF_BLOCK,
    label: 'Saved section (live)',
    icon: 'section',
    category: 'Dynamic',
    // It renders the section's blocks with their own classes and no element of its own.
    styles: false,
    fields: [
      {
        name: 'section',
        type: 'relationship',
        label: 'Saved section',
        relationTo: collection as CollectionSlug,
        required: true,
        admin: {
          description:
            'Shows this saved section as it is now: edit the section and every page that uses it changes. ' +
            'To change it on this page only, use "Detach section" in the block menu.',
        },
      },
    ],
    ai: {
      description:
        `Shows a saved section (the "${collection}" collection) live: the page renders the section's current blocks, so one ` +
        'edit of the section changes every page that uses it. Set "section" to the saved section\'s document id ' +
        '(listSections shows saved sections as "saved:<id>"; use the number). It has no className and no slots. ' +
        'Use it for blocks many pages share (a call to action, a footer band). To insert a copy that the page can change, ' +
        'use insertSection instead. A sectionRef inside a saved section renders nothing.',
      example: { type: SECTION_REF_BLOCK, props: { section: 1 } },
    },
  })
}
