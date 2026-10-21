import { DISCLOSURE_CLASS_MAP as C } from '../../../blocks/builtins/disclosure'
import type { BlockComponentProps } from '../../render/types'

/**
 * A native <details>: it opens with the mouse and the keyboard without script, and the closed
 * content stays in the HTML. The height animation is CSS only. Open on the canvas, so both slots
 * can be edited.
 */
export function Disclosure({ props, className, attributes, slotAttributes, slots, mode }: BlockComponentProps) {
  const open = mode === 'canvas' || props.open === true
  const classes = props.animate === false ? className : className ? `${className} ${C.animate}` : C.animate
  return (
    <details {...attributes} className={classes} open={open || undefined}>
      <summary {...slotAttributes.summary} className={C.summary}>
        {slots.summary}
      </summary>
      <div {...slotAttributes.content}>{slots.content}</div>
    </details>
  )
}
