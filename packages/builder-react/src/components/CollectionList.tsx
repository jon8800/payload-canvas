import { LIST_ITEM_SLOT } from '@payload-toolkit/builder/core'
import type { BlockComponentProps } from '../render/types'

/**
 * The collection list block. RenderLayout renders the `item` slot once per document; this
 * component only wraps the items. Nothing on the site when the list is empty.
 */
export function CollectionList({ className, attributes, slots, slotAttributes, mode }: BlockComponentProps) {
  const items = slots[LIST_ITEM_SLOT]
  if (!items && mode !== 'canvas') return null
  return (
    <div {...attributes} {...slotAttributes[LIST_ITEM_SLOT]} className={className}>
      {items}
    </div>
  )
}
