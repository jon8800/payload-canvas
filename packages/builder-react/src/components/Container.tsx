import type { BlockComponentProps } from '../render/types'

/** Used for `stack` and `grid`. All layout comes from `className`. */
export function Container({ className, attributes, slotAttributes, slots }: BlockComponentProps) {
  return (
    <div {...attributes} {...slotAttributes.children} className={className}>
      {slots.children}
    </div>
  )
}
