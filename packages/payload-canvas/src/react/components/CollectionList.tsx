import { createElement } from 'react'
import { LIST_EMPTY_SLOT, LIST_ITEM_SLOT, REPEAT_BLOCK } from '../../core'
import type { BlockComponentProps } from '../render/types'

const CONTENTS = { display: 'contents' } as const

/**
 * The collection list and repeat blocks. RenderLayout renders the `item` slot once per document or
 * row; this component only wraps the items. A collection list without documents shows its `empty`
 * slot instead. Nothing on the site when both are empty. A repeat with `as: 'none'` has no wrapper:
 * its rows sit in the parent. The canvas keeps an element with `display: contents` there, so the
 * editor can still find and measure the repeat.
 */
export function CollectionList({ block, props, className, attributes, slots, slotAttributes, mode }: BlockComponentProps) {
  const items = slots[LIST_ITEM_SLOT]
  const empty = slots[LIST_EMPTY_SLOT]
  if (!items && !empty && mode !== 'canvas') return null
  if (block.type === REPEAT_BLOCK && props.as === 'none') {
    if (mode !== 'canvas') return items
    return createElement('div', { ...attributes, ...slotAttributes[LIST_ITEM_SLOT], style: CONTENTS }, items)
  }
  return (
    <div {...attributes} {...slotAttributes[LIST_ITEM_SLOT]} className={className}>
      {items}
      {/* The empty slot takes its own classes (`slotClassName.empty`) through its slot attributes. */}
      {empty && <div {...slotAttributes[LIST_EMPTY_SLOT]}>{empty}</div>}
    </div>
  )
}
