import type { CollectionSlug } from 'payload'
import { defineBlock } from '../../core/blocks'
import { findLocation, normalizeLayout } from '../../core/tree'
import type { Block, BlockDefinition, Layout, Operation } from '../../core/types'

export const SECTION_REF_BLOCK = 'sectionRef'

/** Key in Payload's `config.custom`: `{ slug }` of the saved sections collection (set by the plugin). */
export const SAVED_SECTIONS_CONFIG_KEY = 'websiteBuilderSavedSections'

/** The saved sections collection of a Payload config, or null when saved sections are off. */
export function savedSectionsSlugOf(config: { custom?: Record<string, unknown> } | undefined): string | null {
  const value = config?.custom?.[SAVED_SECTIONS_CONFIG_KEY] as { slug?: unknown } | undefined
  return typeof value?.slug === 'string' ? value.slug : null
}

/**
 * Runtime-only slot: the saved section's blocks, put there by `attachSections` (data loading).
 * Never stored. Its blocks are copies with ids prefixed by the ref's id.
 */
export const SECTION_REF_SLOT = '$section'

/** The copy's own values for the component's properties (core/components.ts), by property name. */
export const SECTION_REF_VALUES = 'values'

/**
 * Runtime-only prop, set by `attachSections`: the saved section could not be loaded (deleted, or
 * no access), or it would contain itself. The canvas says so; the site shows nothing.
 */
export const SECTION_REF_MISSING = '$missing'

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
 * shows on every page that uses it. "Detach" in the block menu replaces it with a copy. The plugin
 * adds this block when saved sections are on, with its saved sections collection
 * (`websiteBuilder({ savedSections: { slug } })`); a site does not add it itself.
 */
export function sectionRefBlock(collection = 'builder-sections'): BlockDefinition {
  return defineBlock({
    type: SECTION_REF_BLOCK,
    label: 'Component',
    description: 'A saved section that stays in sync on every page. Each copy can set its own text, images and links.',
    icon: 'sectionRef',
    category: 'Dynamic',
    // It renders the section's blocks with their own classes and no element of its own.
    styles: false,
    fields: [
      {
        name: 'section',
        type: 'relationship',
        label: 'Component',
        relationTo: collection as CollectionSlug,
        required: true,
      },
      {
        // Edited as the component's properties (admin/editor/sections/ComponentFields.tsx). Content in
        // content mode: the designer chose which text, images and links a copy may change.
        name: SECTION_REF_VALUES,
        type: 'json',
        admin: { hidden: true, custom: { builderContent: true } },
      },
    ],
    ai: {
      description:
        `Shows a saved section (the "${collection}" collection) live: the page renders the section's current blocks, so one ` +
        'edit of the section changes every page that uses it. Set "section" to the saved section\'s document id ' +
        '(listSections shows saved sections as "saved:<id>"; use the number). It has no className and no slots. ' +
        'Use it for blocks many pages share (a call to action, a footer band). A saved section with properties is a component ' +
        '(listSections shows `component: true` and its `properties`): set "values" to { <property name>: value } to give this ' +
        'copy its own text, rich text, image (an upload id), link ({ type: "url", url }) or visible (true/false) values; a ' +
        'property left out shows the content of the component itself. insertSection with `values` does this for you. To insert ' +
        'blocks the page can change freely, use insertSection with linked: false. A component never contains itself.',
      example: { type: SECTION_REF_BLOCK, props: { section: 1, values: { title: 'Ready to start?' } } },
    },
  })
}
