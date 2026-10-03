'use client'

// Breakpoint chips and state buttons. Dots mark variants that already have classes.
// The breakpoint here is independent of the canvas width. When the canvas is too narrow for the
// chosen breakpoint, a hint offers to resize it.

import { useMemo } from 'react'

import { STATES, variantPrefix, variantsInUse, type Breakpoint, type StyleState, type StyleTokens, type Variant } from '../../../core'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import { useStyles } from './context'
import { BREAKPOINTS, breakpointWidths } from './tokens'

const STATE_LABELS: Record<StyleState, string> = { default: 'Default', hover: 'Hover', focus: 'Focus', active: 'Active' }

function safeVariantsInUse(className: string, tokens: StyleTokens): Variant[] {
  try {
    return variantsInUse(className, tokens)
  } catch {
    return []
  }
}

/** "base · all sizes", "md · 768px and wider". */
export function breakpointLabel(bp: Breakpoint, widths: Record<Breakpoint, number>): string {
  return bp === 'base' ? 'base · all sizes' : `${bp} · ${widths[bp]}px and wider`
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
            title={bp === 'base' ? 'Styles for all screen sizes (mobile first)' : `Styles for screens ${widths[bp]}px and wider`}
            onClick={() => store.setVariant({ ...variant, breakpoint: bp })}
          >
            <span className="builder-styles__chip-name">{bp}</span>
            <span className="builder-styles__chip-width">{bp === 'base' ? 'all' : `${widths[bp]}+`}</span>
            {inUse.some((v) => v.breakpoint === bp) && <span className="builder-styles__dot" />}
          </button>
        ))}
      </fieldset>
      <fieldset className="builder-styles__states" aria-label="State">
        {STATES.map((id) => (
          <button
            key={id}
            type="button"
            className="builder-styles__state"
            aria-pressed={variant.state === id}
            onClick={() => store.setVariant({ ...variant, state: id })}
          >
            {STATE_LABELS[id]}
            {inUse.some((v) => v.breakpoint === variant.breakpoint && v.state === id) && <span className="builder-styles__dot" />}
          </button>
        ))}
      </fieldset>
      <p className="builder-styles__variant-hint">
        Editing <strong>{breakpointLabel(variant.breakpoint, widths)}</strong>
        {variant.state !== 'default' && <> · on {variant.state}</>}
        {prefix && (
          <>
            {' '}
            <code>{prefix}</code>
          </>
        )}
      </p>
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
