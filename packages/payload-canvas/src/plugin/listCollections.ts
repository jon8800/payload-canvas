import type { Field } from 'payload'
import { COLLECTION_LIST_BLOCK, REPEAT_BLOCK } from '../core/bindings'
import { withInlineBlocks } from '../core/blocks'
import type { BlockDefinition } from '../core/types'

/**
 * The collection list block shows only the given collections (see `listableCollections`): its `collection` text field
 * (and the field list's optional one, for `$url`) becomes a select of them, so the editor offers a list and validation rejects other values.
 * Returns the same list when there is nothing to change.
 */
export function listCollectionsOf(blocks: BlockDefinition[], slugs: string[]): BlockDefinition[] {
  if (slugs.length === 0) return blocks
  return blocks.map((block) => {
    if (block.type !== COLLECTION_LIST_BLOCK && block.type !== REPEAT_BLOCK) return block
    // A field list's collection is optional (only for `$url`).
    const required = block.type === COLLECTION_LIST_BLOCK
    const fields = block.fields.map((field): Field => {
      if (!('name' in field)) return field
      if (field.name === 'collection' && field.type === 'text') {
        return { name: 'collection', type: 'select', label: field.label ?? 'Collection', options: slugs, required, admin: { description: field.admin?.description } }
      }
      // Picked documents: a relationship to the collections the list can show.
      if (block.type === COLLECTION_LIST_BLOCK && field.name === 'ids' && field.type === 'text') {
        return {
          name: 'ids',
          type: 'relationship',
          label: 'Picked documents',
          relationTo: slugs.length === 1 ? slugs[0]! : slugs,
          hasMany: true,
          admin: { description: field.admin?.description },
        } as Field
      }
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
 * The block list as `websiteBuilder` and `builderMcpTools` use it: `listCollectionsOf` (the
 * collection list's `collection` and `ids` point to `listCollections`, the collections with a
 * `url` and the `listCollections` option), then `withInlineBlocks` (inline blocks may go straight into a link). Run it on the
 * site's own list too, so a seed's `validateLayout` agrees with the editor. Running it twice
 * changes nothing.
 */
export function prepareBlocks(blocks: BlockDefinition[], listCollections: string[] = []): BlockDefinition[] {
  return withInlineBlocks(listCollectionsOf(blocks, listCollections))
}
