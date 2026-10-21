import type { Field } from 'payload'
import { COLLECTION_LIST_BLOCK, REPEAT_BLOCK } from '../core/bindings'
import type { BlockDefinition } from '../core/types'

/**
 * The collection list block shows only collections with a `url`: its `collection` text field
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
