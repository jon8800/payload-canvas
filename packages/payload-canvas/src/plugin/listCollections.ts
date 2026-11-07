import type { Field } from 'payload'
import { SECTION_REF_BLOCK, sectionRefBlock } from '../blocks/builtins/sectionRef'
import { listCollectionField, pickedDocumentsField } from '../blocks/defaults'
import { COLLECTION_LIST_BLOCK, REPEAT_BLOCK } from '../core/bindings'
import { withInlineBlocks } from '../core/blocks'
import type { BlockDefinition } from '../core/types'

/**
 * The collection list block shows only the given collections (see `listableCollections`): its
 * `collection` text field (and the repeat's optional one, for `$url`) becomes a select of them,
 * and its picked `ids` a relationship to them, so the editor offers a list and validation rejects
 * other values. The same fields as `defaultBlocks({ listCollections })`. Returns the same list
 * when there is nothing to change.
 */
export function listCollectionsOf(blocks: BlockDefinition[], slugs: string[]): BlockDefinition[] {
  if (slugs.length === 0) return blocks
  return blocks.map((block) => {
    if (block.type !== COLLECTION_LIST_BLOCK && block.type !== REPEAT_BLOCK) return block
    // A repeat's collection is optional (only for `$url`).
    const required = block.type === COLLECTION_LIST_BLOCK
    const fields = block.fields.map((field): Field => {
      if (!('name' in field)) return field
      if (field.name === 'collection' && field.type === 'text') {
        const description = typeof field.admin?.description === 'string' ? field.admin.description : undefined
        return listCollectionField(slugs, { label: typeof field.label === 'string' ? field.label : 'Collection', required, description })
      }
      if (block.type === COLLECTION_LIST_BLOCK && field.name === 'ids' && field.type === 'text') return pickedDocumentsField(slugs)
      return field
    })
    return { ...block, fields }
  })
}

/**
 * The collections the collection list block can show: the collections with a `url`, then the
 * `listCollections` option (data collections without pages), each once.
 */
export function listableCollections(
  collections: Record<string, { url?: unknown }>,
  extra: readonly string[] = [],
): string[] {
  const routed = Object.entries(collections).filter(([, o]) => o.url).map(([slug]) => slug)
  return [...new Set([...routed, ...extra])]
}

/**
 * The live saved section block (`sectionRef`) for the saved sections collection `slug`: added
 * when the list has none, or pointed at `slug` when it has one. Null `slug` (saved sections off)
 * changes nothing.
 */
function withSectionRef(blocks: BlockDefinition[], slug: string | null): BlockDefinition[] {
  if (!slug) return blocks
  const index = blocks.findIndex((block) => block.type === SECTION_REF_BLOCK)
  if (index === -1) return [...blocks, sectionRefBlock(slug)]
  return blocks.map((block, i) => (i === index ? { ...block, fields: sectionRefBlock(slug).fields } : block))
}

/**
 * The block list as `websiteBuilder` and `builderMcpTools` use it: `listCollectionsOf` (the
 * collection list's `collection` and `ids` point to `listCollections`, the collections with a
 * `url`), `withInlineBlocks` (inline blocks may go straight into a link), and the `sectionRef`
 * block for the saved sections collection `sectionsCollection`. Running it twice changes nothing.
 * A site's own list does not need it: `validateLayout` applies `withInlineBlocks` itself.
 */
export function prepareBlocks(blocks: BlockDefinition[], listCollections: string[] = [], sectionsCollection: string | null = null): BlockDefinition[] {
  return withInlineBlocks(withSectionRef(listCollectionsOf(blocks, listCollections), sectionsCollection))
}
