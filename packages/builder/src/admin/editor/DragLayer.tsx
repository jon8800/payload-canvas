'use client'

import { useRuntime } from './runtime'
import { useValue } from './valueStore'

/**
 * Admin-level drag visuals in client coordinates: the label that follows the pointer and the
 * outline drop indicator. The canvas drop indicator lives in the overlay (iframe coordinates).
 */
export function DragLayer() {
  const runtime = useRuntime()
  const drag = useValue(runtime.drag)
  if (!drag?.pointer) return null
  const indicator = drag.zone === 'outline' && drag.target && !drag.target.noop ? drag.target.indicator : null
  const refused = drag.zone !== null && !drag.target

  return (
    <>
      <div
        className={`builder-editor__ghost${refused ? ' builder-editor__ghost--refused' : ''}`}
        style={{ left: drag.pointer.x + 14, top: drag.pointer.y + 14 }}
      >
        {drag.label}
      </div>
      {indicator && (
        <div
          className={`builder-editor__drop builder-editor__drop--fixed builder-editor__drop--${indicator.kind}`}
          style={{
            left: indicator.rect.x,
            top: indicator.rect.y,
            width: indicator.rect.width,
            height: indicator.rect.height,
          }}
        />
      )}
    </>
  )
}
