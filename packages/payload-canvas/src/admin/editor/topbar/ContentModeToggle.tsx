'use client'

// Content mode in the top bar: a calm "Content mode" label while only text, images and links can
// change, and for designers a "Preview as client" toggle that turns content mode on and off.

import { setPreviewAsClient, useContentMode } from '../contentMode'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import './contentMode.scss'

const LABEL_TIP = 'You can change text, images and links'

/** The "Content mode" label. Shown only in content mode. */
export function ContentModeLabel() {
  const runtime = useRuntime()
  const on = useContentMode(runtime)
  if (!on) return null
  return (
    <span className="builder-bar__content-mode" data-tooltip={LABEL_TIP} aria-label={`Content mode. ${LABEL_TIP}.`}>
      <Icon name="rename" size={12} />
      Content mode
    </span>
  )
}

/** "Preview as client": designers see and edit the page as a client does. Hidden for clients. */
export function PreviewAsClientToggle() {
  const runtime = useRuntime()
  const on = useContentMode(runtime)
  if (!runtime.canEditDesign) return null
  const tip = on ? 'Back to full editing' : 'Edit as a client: text, images and links only'
  return (
    <button
      type="button"
      className="builder-bar__button builder-bar__client-toggle"
      aria-pressed={on}
      aria-label="Preview as client"
      data-tooltip={tip}
      onClick={() => setPreviewAsClient(runtime, !on)}
    >
      <Icon name={on ? 'eyeOff' : 'eye'} size={14} />
      <span className="builder-bar__label">Preview as client</span>
    </button>
  )
}
