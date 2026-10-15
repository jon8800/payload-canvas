'use client'

// The page's fixed regions in the Layers panel, above the layout's tree. They select the region;
// they are not part of the tree, so nothing drags onto or out of them.

import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useOptionalValue } from '../valueStore'

export function RegionRows() {
  const runtime = useRuntime()
  const regions = runtime.regions
  const selected = useOptionalValue(regions?.selected ?? null)
  const hovered = useOptionalValue(regions?.hovered ?? null)
  if (!regions || regions.config.length === 0) return null
  return (
    <section className="builder-region__rows" aria-label="Fixed parts of the page">
      {regions.config.map((region) => (
        <button
          key={region.name}
          type="button"
          className={[
            'builder-editor__row',
            'builder-region__row',
            selected === region.name && 'builder-editor__row--selected',
            hovered === region.name && selected !== region.name && 'builder-editor__row--hovered',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={selected === region.name}
          data-tooltip="A fixed part of the page: its fields, not blocks"
          data-tooltip-side="right"
          onClick={() => regions.selected.set(region.name)}
          onPointerEnter={() => regions.hovered.set(region.name)}
          onPointerLeave={() => regions.hovered.set(null)}
        >
          <span className="builder-editor__row-icon">
            <Icon name="lock" size={14} />
          </span>
          <span className="builder-editor__row-type">{region.label}</span>
          <span className="builder-editor__row-text">Fixed</span>
        </button>
      ))}
    </section>
  )
}
