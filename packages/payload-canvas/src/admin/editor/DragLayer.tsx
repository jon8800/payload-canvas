'use client'

import { useCallback } from 'react'

import { registerGhost, smoothView, type SmoothView } from './dnd/smooth'
import { BlockIcon } from './icons'
import { useRuntime } from './runtime'
import { useValue } from './valueStore'

/**
 * Admin-level drag visuals in client coordinates. Indicator mode: the label that follows the
 * pointer and the outline drop indicator (the canvas indicator lives in the overlay). Smooth mode:
 * a lifted copy of the row; the dnd controller moves it without React renders.
 */
export function DragLayer() {
  const runtime = useRuntime()
  const smooth = useValue(smoothView(runtime))
  return smooth ? <SmoothGhost view={smooth} /> : <IndicatorLayer />
}

function IndicatorLayer() {
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
        <BlockIcon name={drag.icon} size={14} />
        {drag.label}
        {refused && <span className="builder-editor__ghost-note">Can’t drop here</span>}
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

/** The lifted row. Position, visibility and the refused state are set by `dnd/smooth.ts`. */
function SmoothGhost({ view }: { view: SmoothView }) {
  const runtime = useRuntime()
  const ref = useCallback((el: HTMLDivElement | null) => registerGhost(runtime, el), [runtime])
  const { ghost } = view
  return (
    <div ref={ref} className="builder-dnd-ghost" aria-hidden="true">
      <div className="builder-dnd-ghost__card" style={{ width: ghost.width ?? undefined }}>
        <BlockIcon name={ghost.icon} size={14} />
        <span className="builder-dnd-ghost__label">{ghost.label}</span>
        <span className="builder-dnd-ghost__note">Can’t drop here</span>
      </div>
    </div>
  )
}
