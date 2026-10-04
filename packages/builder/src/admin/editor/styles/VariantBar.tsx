'use client'

// Breakpoint chips and the state select. Dots mark variants that already have classes.
// The breakpoint here is independent of the canvas width. Edits at "all sizes" reach every
// screen; a control whose value a larger breakpoint overrides on the canvas says so and offers
// to edit that breakpoint (see OverrideNote). When the canvas is too narrow for the chosen
// breakpoint, a hint offers to resize it.

import { useMemo } from 'react'

import { STATES, variantPrefix, variantsInUse, type Breakpoint, type StyleState, type StyleTokens, type Variant } from '../../../core'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import { useStyles } from './context'
import { BREAKPOINTS, breakpointWidths } from './tokens'

const STATE_LABELS: Record<StyleState, string> = {
  default: 'Default',
  hover: 'On hover',
  focus: 'On focus',
  active: 'While pressed',
}

function safeVariantsInUse(className: string, tokens: StyleTokens): Variant[] {
  try {
    return variantsInUse(className, tokens)
  } catch {
    return []
  }
}

/** "all screen sizes", "md · 768 px and wider". */
export function breakpointLabel(bp: Breakpoint, widths: Record<Breakpoint, number>): string {
  return bp === 'base' ? 'all screen sizes' : `${bp} · ${widths[bp]} px and wider`
}

export function VariantBar() {
  const runtime = useRuntime()
  const { store } = runtime
  const { className, variant, tokens } = useStyles()
  const frame = useValue(runtime.frame)
  const widths = useMemo(() => breakpointWidths(tokens), [tokens])
  const inUse = useMemo(() => safeVariantsInUse(className, tokens), [className, tokens])
  const prefix = variantPrefix(variant)
  const minWidth = widths[variant.breakpoint]
  const tooNarrow = variant.breakpoint !== 'base' && frame.width > 0 && frame.width < minWidth

  return (
    <div className="builder-styles__variants">
      <fieldset className="builder-styles__breakpoints" aria-label="Breakpoint">
        {BREAKPOINTS.map((bp) => (
          <button
            key={bp}
            type="button"
            className="builder-styles__chip"
            aria-pressed={variant.breakpoint === bp}
            title={bp === 'base' ? 'Styles for every screen size' : `Styles for screens ${widths[bp]} px and wider`}
            onClick={() => store.setVariant({ ...variant, breakpoint: bp })}
          >
            <span className="builder-styles__chip-name">{bp === 'base' ? 'All' : bp}</span>
            <span className="builder-styles__chip-width">{bp === 'base' ? 'sizes' : `${widths[bp]}+`}</span>
            {inUse.some((v) => v.breakpoint === bp) && <span className="builder-styles__dot" />}
          </button>
        ))}
      </fieldset>
      <div className="builder-styles__state-row">
        <p className="builder-styles__variant-hint">
          Editing <strong>{breakpointLabel(variant.breakpoint, widths)}</strong>
          {prefix && (
            <>
              {' '}
              <code>{prefix}</code>
            </>
          )}
        </p>
        <label className="builder-styles__state-field">
          State
          <select
            className="builder-styles__select"
            value={variant.state}
            onChange={(e) => store.setVariant({ ...variant, state: e.target.value as StyleState })}
          >
            {STATES.map((id) => {
              const used = id !== 'default' && inUse.some((v) => v.breakpoint === variant.breakpoint && v.state === id)
              return (
                <option key={id} value={id}>
                  {STATE_LABELS[id]}
                  {used ? ' •' : ''}
                </option>
              )
            })}
          </select>
        </label>
      </div>
      {tooNarrow && (
        <output className="builder-styles__width-hint">
          <span>
            {variant.breakpoint} styles don’t apply at the current {Math.round(frame.width)} px width.
          </span>
          <button type="button" className="builder-styles__width-action" onClick={() => store.setCanvasWidth(minWidth)}>
            <Icon name="width" size={14} /> Resize canvas
          </button>
        </output>
      )}
    </div>
  )
}
