import type { Field } from 'payload'
import { COLLECTION_LIST_BLOCK } from '../core/bindings'
import type { BlockDefinition } from '../core/types'

/**
 * The collection list block shows only collections with a `url`: its `collection` text field
 * becomes a select of them, so the editor offers a list and validation rejects other values.
 * Returns the same list when there is nothing to change.
 */
export function listCollectionsOf(blocks: BlockDefinition[], slugs: string[]): BlockDefinition[] {
  if (slugs.length === 0) return blocks
  return blocks.map((block) => {
    if (block.type !== COLLECTION_LIST_BLOCK) return block
    const fields = block.fields.map((field): Field =>
      'name' in field && field.name === 'collection' && field.type === 'text'
        ? { name: 'collection', type: 'select', label: field.label ?? 'Collection', options: slugs, required: true }
        : field,
    )
    return { ...block, fields }
  })
}
