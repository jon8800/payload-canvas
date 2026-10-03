import { linkAttributes } from '../render/link'
import type { BlockComponentProps } from '../render/types'

/** A clickable container: an `<a>` around its children, or a `<div>` when the link has no href. */
export function Link({ props, className, attributes, slotAttributes, slots, resolveLink }: BlockComponentProps) {
  const link = linkAttributes(props.link, resolveLink)
  if (!link) {
    return (
      <div {...attributes} {...slotAttributes.children} className={className}>
        {slots.children}
      </div>
    )
  }
  return (
    <a {...attributes} {...slotAttributes.children} {...link} className={className}>
      {slots.children}
    </a>
  )
}
