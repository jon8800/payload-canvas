import { linkAttributes } from '../render/link'
import type { BlockComponentProps } from '../render/types'

/** A clickable container: an `<a>` around its children, or a `<div>` when the link has no href. */
export function Link({ props, className, attributes, partAttributes, slots, linkComponent }: BlockComponentProps) {
  const link = linkAttributes(props.link)
  if (!link) {
    return (
      <div {...attributes} {...partAttributes.children} className={className}>
        {slots.children}
      </div>
    )
  }
  // The site's link component (`RenderLayout`'s `linkComponent`), else a plain <a>.
  const A = linkComponent ?? 'a'
  return (
    <A {...attributes} {...partAttributes.children} {...link} className={className}>
      {slots.children}
    </A>
  )
}
