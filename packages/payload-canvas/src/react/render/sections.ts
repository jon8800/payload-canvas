// Live saved sections: puts the current blocks of each `sectionRef` block's saved section into its
// runtime slot, before the rest of the data loading (so the section's lists, images and
// translations load like the page's own). Shared by `loadLayoutData` and the canvas.
//
// It names the built-in `sectionRef` block on purpose: putting stored blocks into a layout before
// the data loading is a step of the renderer, not of a block component, and the block contract has
// no loader hook. A general hook would be added when a second block needs one.

import { SECTION_REF_BLOCK, SECTION_REF_SLOT, sectionRefBlocks, sectionRefId } from '../../blocks/builtins/sectionRef'
import type { Block, BlockDefinition, Layout } from '../../core'
import type { FetchDocs } from './types'

/** The collection the sectionRef definition's `section` field points at. */
function sectionsCollectionOf(blocks: readonly BlockDefinition[]): string | null {
  const field = blocks.find((def) => def.type === SECTION_REF_BLOCK)?.fields.find((f) => 'name' in f && f.name === 'section')
  const relationTo = field && 'relationTo' in field ? field.relationTo : null
  return typeof relationTo === 'string' ? relationTo : null
}

function collectIds(blocks: readonly Block[], ids: Set<string | number>): void {
  for (const block of blocks) {
    if (block.type === SECTION_REF_BLOCK) {
      const id = sectionRefId(block.props?.section)
      if (id !== null) ids.add(id)
    }
    for (const list of Object.values(block.slots ?? {})) collectIds(list, ids)
  }
}

/**
 * Fills the runtime slot (`SECTION_REF_SLOT`) of every `sectionRef` block with its saved section's
 * blocks, loaded with `fetchDocs` (one call). One level: a sectionRef inside a saved section stays
 * empty, so a section can never include itself. A missing section leaves the slot out. Returns
 * the same layout when there is nothing to load. Never mutates.
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
  const ids = new Set<string | number>()
  collectIds(layout.blocks, ids)
  if (ids.size === 0) return layout
  const docs = await fetchDocs(collection, [...ids])
  const docOf = (id: string | number) => docs.get(id) ?? docs.get(String(id)) ?? docs.get(Number(id))

  const fill = (list: Block[]): Block[] =>
    list.map((block) => {
      if (block.type === SECTION_REF_BLOCK) {
        const id = sectionRefId(block.props?.section)
        const doc = id === null ? undefined : docOf(id)
        if (!doc) return block
        return { ...block, slots: { ...block.slots, [SECTION_REF_SLOT]: sectionRefBlocks(block.id, doc.blocks) } }
      }
      if (!block.slots) return block
      return { ...block, slots: Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, fill(children)])) }
    })
  return { ...layout, blocks: fill(layout.blocks) }
}
