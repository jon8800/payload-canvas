import { DISCLOSURE_CLASS_MAP as C } from '../../../blocks/builtins/disclosure'
import { joinClasses } from '../../../blocks/builtins/shared'
import type { BlockComponentProps } from '../../render/types'

/**
 * A native <details>: it opens with the mouse and the keyboard without script, and the closed
 * content stays in the HTML. The height animation is CSS only. The editor's canvas shows it as the
 * site does: a click on the summary opens and closes it, and selecting a block inside it (or the
 * disclosure itself) opens it.
 */
export function Disclosure({ props, className, attributes, partAttributes, slots }: BlockComponentProps) {
  const open = props.open === true
  const classes = props.animate === false ? className : className ? `${className} ${C.animate}` : C.animate
  return (
    <details {...attributes} className={classes} open={open || undefined}>
      <summary {...partAttributes.summary} className={joinClasses(C.summary, partAttributes.summary?.className)}>
        {slots.summary}
      </summary>
      <div {...partAttributes.content}>{slots.content}</div>
    </details>
  )
}
