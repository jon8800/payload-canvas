import { createElement } from 'react'
import type { BlockComponentProps } from '../render/types'

const TAGS = new Set(['div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside'])

/** Used for `stack` and `grid`. All layout comes from `className`. `as` picks the HTML tag. */
export function Container({ props, className, attributes, slotAttributes, slots }: BlockComponentProps) {
  const tag = typeof props.as === 'string' && TAGS.has(props.as) ? props.as : 'div'
  return createElement(tag, { ...attributes, ...slotAttributes.children, className }, slots.children)
}
