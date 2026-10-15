'use client'

// Page regions on the canvas overlay: a dashed outline on hover and selection, a name tag that
// says the region is fixed, and one action: "Edit fields" (the settings drawer, at the region's
// first field). No drag handle, no menu: regions are never moved, duplicated or deleted.

import type { CSSProperties } from 'react'

import type { Rect } from '../../../core/types'
import { Icon } from '../icons'
import { inlineEditing } from '../inline'
import { InlineToolbar } from '../InlineToolbar'
import { useRuntime, type Runtime } from '../runtime'
import { useOptionalValue, useValue } from '../valueStore'
import type { RegionsController } from './controller'

type TagProps = { className: string; style?: CSSProperties }

const box = (rect: Rect): CSSProperties => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })

/** The box of a region on the canvas: the largest of its visible elements. */
function regionRect(rects: readonly { name: string; rect: Rect }[] | undefined, name: string | null): Rect | null {
  if (!name) return null
  let best: Rect | null = null
  for (const entry of rects ?? []) {
    if (entry.name !== name) continue
    if (!best || entry.rect.width * entry.rect.height > best.width * best.height) best = entry.rect
  }
  return best
}

/** Opens the settings drawer at the region's first field (or at its top for a region without fields). */
export function editRegionFields(runtime: Runtime, regions: RegionsController, name: string) {
  const first = regions.region(name)?.fields[0]
  runtime.doc.openSettings(first ? { path: first.path, tabs: first.tabs } : undefined)
}

export function RegionOverlay({
  tagProps,
  editedRect,
  zoom,
}: {
  /** The overlay's name tag placement. */
  tagProps: (rect: Rect, modifier?: string) => TagProps
  /** The element edited inline now, or null. */
  editedRect: Rect | null
  zoom: number
}) {
  const runtime = useRuntime()
  const regions = runtime.regions
  const selected = useOptionalValue(regions?.selected ?? null)
  const hovered = useOptionalValue(regions?.hovered ?? null)
  const measurement = useValue(runtime.measurement)
  const drag = useValue(runtime.drag)
  const inline = useValue(inlineEditing(runtime))
  if (!regions) return null
  const hoverRect = !drag && hovered !== selected ? regionRect(measurement?.regions, hovered) : null
  const selectedRect = regionRect(measurement?.regions, selected)
  const hoverRegion = regions.region(hovered)
  const region = regions.region(selected)
  const editing = Boolean(inline?.region && inline.region === selected)
  const editRect = editing ? (editedRect ?? selectedRect) : selectedRect

  return (
    <>
      {hoverRect && hoverRegion && (
        <div className="builder-editor__hover builder-editor__hover--region" style={box(hoverRect)}>
          <span {...tagProps(hoverRect, 'hover')}>
            <Icon name="lock" size={12} />
            {hoverRegion.label}
          </span>
        </div>
      )}
      {region && selectedRect && editRect && (
        <>
          <div
            className={`builder-editor__selection builder-editor__selection--region${editing ? ' builder-editor__selection--editing' : ''}`}
            style={box(editRect)}
          >
            {editing && inline?.kind !== 'rich' && (
              <span {...tagProps(editRect, 'editing')}>
                <Icon name="rename" size={12} />
                Editing text · Esc to finish
              </span>
            )}
            {!editing && !drag && (
              <span {...tagProps(selectedRect)} data-tooltip="A fixed part of the page. Edit its text and images here, or its fields in the settings.">
                <Icon name="lock" size={12} />
                {region.label}
                <span className="builder-editor__tag-note">Fixed</span>
              </span>
            )}
          </div>
          {!editing && !drag && (
            <div
              className={`builder-editor__actions builder-editor__actions--${selectedRect.y * zoom >= 26 ? 'above' : 'inside'}`}
              style={{ left: selectedRect.x + selectedRect.width, top: selectedRect.y }}
            >
              <button
                type="button"
                className="builder-editor__action builder-editor__action--text"
                aria-label={`Edit the fields of ${region.label}`}
                data-tooltip="Edit all fields in the settings"
                onClick={() => editRegionFields(runtime, regions, region.name)}
              >
                <Icon name="settings" size={14} />
                Edit fields
              </button>
            </div>
          )}
          {editing && editRect && inline?.kind === 'rich' && <InlineToolbar inline={inline} rect={editRect} zoom={zoom} />}
        </>
      )}
    </>
  )
}
