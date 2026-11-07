// Live saved sections: puts the current blocks of each `sectionRef` block's saved section into its
// runtime slot, before the rest of the data loading (so the section's lists, images and
// translations load like the page's own). Shared by `loadLayoutData` and the canvas.
//
// It names the built-in `sectionRef` block on purpose: putting stored blocks into a layout before
// the data loading is a step of the renderer, not of a block component, and the block contract has
// no loader hook. A general hook would be added when a second block needs one.

import {
  SECTION_REF_BLOCK,
  SECTION_REF_MISSING,
  SECTION_REF_SLOT,
  sectionRefBlocks,
  sectionRefId,
} from '../../blocks/builtins/sectionRef'
import { applyComponentValues, componentValuesOf, normalizeLayout, type Block, type BlockDefinition, type Layout } from '../../core'
import type { FetchDocs } from './types'

/** How deep components may sit inside components. Deeper ones render nothing. */
export const MAX_COMPONENT_DEPTH = 5

/** The collection the sectionRef definition's `section` field points at. */
function sectionsCollectionOf(blocks: readonly BlockDefinition[]): string | null {
  const field = blocks.find((def) => def.type === SECTION_REF_BLOCK)?.fields.find((f) => 'name' in f && f.name === 'section')
  const relationTo = field && 'relationTo' in field ? field.relationTo : null
  return typeof relationTo === 'string' ? relationTo : null
}

/** The ids of the saved sections that `sectionRef` blocks point at. Skips filled runtime slots. */
function collectIds(blocks: readonly Block[], ids: Map<string, string | number>): void {
  for (const block of blocks) {
    if (block.type === SECTION_REF_BLOCK) {
      const id = sectionRefId(block.props?.section)
      if (id !== null && !ids.has(String(id))) ids.set(String(id), id)
      continue
    }
    for (const list of Object.values(block.slots ?? {})) collectIds(list, ids)
  }
}

const missing = (block: Block): Block => ({ ...block, props: { ...block.props, [SECTION_REF_MISSING]: true } })

/**
 * Fills the runtime slot (`SECTION_REF_SLOT`) of every `sectionRef` block with its saved section's
 * blocks, loaded with `fetchDocs` (one call per level of nesting). A component's copy gets its own
 * values (`applyComponentValues`). Components inside components load too, up to
 * `MAX_COMPONENT_DEPTH`; one that would contain itself gets `SECTION_REF_MISSING`, like one that
 * cannot be loaded. Returns the same layout when there is nothing to load. Never mutates.
 *
 * `collection` is the saved sections collection. Default: the one the sectionRef definition in
 * `blocks` points at (the plugin adds that definition; a site's own list usually has none).
 */
export async function attachSections(
  layout: Layout,
  blocks: readonly BlockDefinition[],
  fetchDocs: FetchDocs,
  collection: string | null = sectionsCollectionOf(blocks),
): Promise<Layout> {
  if (!collection) return layout
  const docs = new Map<string, Record<string, unknown>>()

  const fill = async (list: Block[], chain: readonly string[]): Promise<Block[]> => {
    const ids = new Map<string, string | number>()
    collectIds(list, ids)
    const wanted = [...ids].filter(([key]) => !docs.has(key)).map(([, id]) => id)
    if (wanted.length > 0) {
      const found = await fetchDocs(collection, wanted)
      for (const [id, doc] of found) docs.set(String(id), doc)
    }
    return Promise.all(
      list.map(async (block): Promise<Block> => {
        if (block.type === SECTION_REF_BLOCK) {
          const id = sectionRefId(block.props?.section)
          if (id === null) return block
          const key = String(id)
          const doc = docs.get(key)
          if (!doc || chain.includes(key) || chain.length >= MAX_COMPONENT_DEPTH) return missing(block)
          const stored = normalizeLayout({ version: 1, blocks: doc.blocks }).blocks
          const own = sectionRefBlocks(block.id, applyComponentValues(stored, componentValuesOf(block.props), blocks))
          return { ...block, slots: { ...block.slots, [SECTION_REF_SLOT]: await fill(own, [...chain, key]) } }
        }
        if (!block.slots) return block
        const slots = await Promise.all(Object.entries(block.slots).map(async ([name, children]) => [name, await fill(children, chain)] as const))
        return { ...block, slots: Object.fromEntries(slots) }
      }),
    )
  }

  const ids = new Map<string, string | number>()
  collectIds(layout.blocks, ids)
  if (ids.size === 0) return layout
  return { ...layout, blocks: await fill(layout.blocks, []) }
}
