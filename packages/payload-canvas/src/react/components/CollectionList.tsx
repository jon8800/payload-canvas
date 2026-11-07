import { createElement, Fragment } from 'react'
import { LIST_EMPTY_SLOT, LIST_ITEM_SLOT, REPEAT_BLOCK } from '../../core'
import { LIST_PAGES_PROP, type ListPages } from '../render/lists'
import type { BlockComponentProps } from '../render/types'
import { asText } from './placeholder'

const CONTENTS = { display: 'contents' } as const

/**
 * The collection list and repeat blocks. RenderLayout renders the `item` slot once per document or
 * row; this component only wraps the items. A collection list without documents shows its `empty`
 * slot instead. Nothing on the site when both are empty. A repeat with `as: 'none'` has no wrapper:
 * its rows sit in the parent. The canvas keeps an element with `display: contents` there, so the
 * editor can still find and measure the repeat.
 *
 * With page links, a plain wrapper (the block element, no classes) holds two elements: the items
 * with the block's classes, and the pager. So a grid of items never makes the pager a grid cell.
 */
export function CollectionList({ block, props, className, attributes, slots, partAttributes, mode }: BlockComponentProps) {
  const items = slots[LIST_ITEM_SLOT]
  const empty = slots[LIST_EMPTY_SLOT]
  if (!items && !empty && mode !== 'canvas') return null
  if (block.type === REPEAT_BLOCK && props.as === 'none') {
    if (mode !== 'canvas') return items
    return createElement('div', { ...attributes, ...partAttributes[LIST_ITEM_SLOT], style: CONTENTS }, items)
  }
  const pages = props[LIST_PAGES_PROP] as ListPages | undefined
  const pager = pages && pages.links.length > 1
  const list = (
    <div {...(pager ? {} : attributes)} {...partAttributes[LIST_ITEM_SLOT]} className={className}>
      {items}
      {/* The empty slot takes its own classes (`partClassName.empty`) through its slot attributes. */}
      {empty && <div {...partAttributes[LIST_EMPTY_SLOT]}>{empty}</div>}
    </div>
  )
  if (!pager) return list
  return (
    <div {...attributes}>
      {list}
      <nav aria-label={asText(props.pagerLabel).trim() || 'Pages'} className={partAttributes.pager?.className}>
        {pages.links.map((link) => (
          <Fragment key={link.page}>
            {link.gapBefore && <span data-page-gap="" aria-hidden="true">…</span>}
            <a
              href={link.href}
              aria-current={link.current ? 'page' : undefined}
              className={partAttributes.pageLink?.className}
            >
              {link.page}
            </a>
          </Fragment>
        ))}
      </nav>
    </div>
  )
}
