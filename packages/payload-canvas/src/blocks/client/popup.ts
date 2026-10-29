// Read by the popup component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * Classes the popup component adds itself. No sizes or colours: those come from the parts'
 * classes (`panel`, `trigger`, `close`). `panel`: Tailwind's reset removes the dialog's
 * `margin: auto`, which centres an open modal dialog; this puts it back.
 */
export const POPUP_CLASS_MAP = classMap({
  panel: 'm-auto',
  trigger: 'cursor-pointer',
  close: 'inline-flex cursor-pointer items-center justify-center',
  icon: 'size-5',
})

/** The popup's labels and their English defaults. */
export const POPUP_LABELS = { closeLabel: 'Close' }
