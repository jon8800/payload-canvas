import { LIST_EMPTY_SLOT, LIST_ITEM_SLOT } from '../../core'
import type { BlockComponentProps } from '../render/types'

/**
 * The collection list and repeat blocks. RenderLayout renders the `item` slot once per document or
 * row; this component only wraps the items. A collection list without documents shows its `empty`
 * slot instead. Nothing on the site when both are empty.
 */
export function CollectionList({ className, attributes, slots, slotAttributes, mode }: BlockComponentProps) {
  const items = slots[LIST_ITEM_SLOT]
  const empty = slots[LIST_EMPTY_SLOT]
  if (!items && !empty && mode !== 'canvas') return null
  return (
    <div {...attributes} {...slotAttributes[LIST_ITEM_SLOT]} className={className}>
      {items}
      {empty && <div {...slotAttributes[LIST_EMPTY_SLOT]}>{empty}</div>}
    </div>
  )
}
