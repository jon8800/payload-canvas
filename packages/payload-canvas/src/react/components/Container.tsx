import { createElement } from 'react'
import type { BlockComponentProps } from '../render/types'

const TAGS = new Set([
  'div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside',
  'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption',
])

/**
 * Used for `stack` and `grid`. All layout comes from `className`. `as` picks the HTML tag: only tags
 * that may hold blocks (no `p` or `span`, which cannot hold a heading or a div).
 */
export function Container({ props, className, attributes, partAttributes, slots }: BlockComponentProps) {
  const tag = typeof props.as === 'string' && TAGS.has(props.as) ? props.as : 'div'
  return createElement(tag, { ...attributes, ...partAttributes.children, className }, slots.children)
}
