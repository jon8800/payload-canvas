'use client'

// Drop outlines: while a block is dragged, a thin dashed outline marks every slot on the canvas
// that takes it (`acceptingSlots`, the same rules as the drop targets). The slot the block would
// drop into gets a stronger outline and its name. Drawn in the overlay, so the page layout never
// moves. The user turns them off in the drag and drop menu (`useDropOutlines`).

import { useMemo, type CSSProperties } from 'react'

import { acceptingSlots, findBlock, getBlockDefinition } from '../../../core'
import { DEFAULT_SLOT } from '../../../core/tree'
import type { DragSource, Rect } from '../../../core/types'
import { blockName } from '../names'
import { useRuntime, type DragState } from '../runtime'
import { useEditor } from '../store'
import { useValue, useValueSelector } from '../valueStore'
import { useDropOutlines } from './mode'

/** What the outlines need of a drag. Changes only when the source or the target slot changes. */
type OutlineDrag = { key: string; source: DragSource; targetOwner: string | null; targetSlot: string | null; line: boolean } | null

function outlineDrag(drag: DragState | null): OutlineDrag {
  if (!drag) return null
  const { source } = drag
  const key = source.kind === 'block' ? `block:${source.id}` : `new:${source.blockType}`
  const target = drag.zone === 'canvas' && drag.target && !drag.target.noop ? drag.target : null
  return {
    key,
    source,
    targetOwner: target?.to.parentId ?? null,
    targetSlot: target ? (target.to.slot ?? DEFAULT_SLOT) : null,
    // A box indicator already names the slot ("Into Stack"); a drop line does not.
    line: target?.indicator.kind === 'line',
  }
}

function sameOutlineDrag(a: OutlineDrag, b: OutlineDrag): boolean {
  if (!a || !b) return a === b
  return a.key === b.key && a.targetOwner === b.targetOwner && a.targetSlot === b.targetSlot && a.line === b.line
}

const box = (rect: Rect): CSSProperties => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })

export function DropOutlines() {
  const runtime = useRuntime()
  const enabled = useDropOutlines(runtime)
  const drag = useValueSelector(runtime.drag, outlineDrag, sameOutlineDrag)
  const measurement = useValue(runtime.measurement)
  const layout = useEditor(runtime.store, (s) => s.layout)
  const { blocks } = runtime.config
  const source = drag?.source ?? null
  const sourceKey = drag?.key ?? null

  // Once per drag: the layout does not change while a block is dragged.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `sourceKey` stands for `source`
  const slots = useMemo(() => (enabled && source ? acceptingSlots(layout, blocks, source) : []), [enabled, sourceKey, layout, blocks])

  if (!drag || slots.length === 0 || !measurement) return null
  const rects = new Map(measurement.slots.map((s) => [`${s.ownerId}\u0000${s.slot}`, s.rect]))

  return (
    <div className="builder-dnd-drops" aria-hidden="true">
      {slots.map(({ ownerId, slot }) => {
        // The root list is the whole page: an outline around it tells nothing.
        if (ownerId === null) return null
        const rect = rects.get(`${ownerId}\u0000${slot}`)
        if (!rect || rect.width <= 0 || rect.height <= 0) return null
        const target = drag.targetOwner === ownerId && drag.targetSlot === slot
        return (
          <div
            key={`${ownerId}:${slot}`}
            className={`builder-dnd-drop${target ? ' builder-dnd-drop--target' : ''}`}
            style={box(rect)}
          >
            {target && drag.line && <span className="builder-dnd-drop__label">{slotName(ownerId, slot)}</span>}
          </div>
        )
      })}
    </div>
  )

  /** "Stack", or "Carousel · Slides" for a block with more than one slot. */
  function slotName(ownerId: string, slot: string): string {
    const owner = findBlock(layout, ownerId)
    if (!owner) return slot
    const def = getBlockDefinition(blocks, owner.type)
    const name = blockName(owner, runtime.blockLabel(owner.type))
    const slotDefs = def?.slots ?? {}
    if (Object.keys(slotDefs).length < 2) return name
    return `${name} · ${slotDefs[slot]?.label ?? slot}`
  }
}
