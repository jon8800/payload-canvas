'use client'

// Breakpoint chips and state buttons. Dots mark variants that already have classes.

import { useMemo } from 'react'

import { STATES, variantPrefix, variantsInUse, type StyleState, type StyleTokens, type Variant } from '../../../core'
import { useRuntime } from '../runtime'
import { useStyles } from './context'
import { BREAKPOINTS, breakpointWidths } from './tokens'
import { selectBreakpoint } from './viewport'

const STATE_LABELS: Record<StyleState, string> = { default: 'Default', hover: 'Hover', focus: 'Focus', active: 'Active' }

function safeVariantsInUse(className: string, tokens: StyleTokens): Variant[] {
  try {
    return variantsInUse(className, tokens)
  } catch {
    return []
  }
}

export function VariantBar() {
  const { store } = useRuntime()
  const { className, variant, tokens } = useStyles()
  const widths = useMemo(() => breakpointWidths(tokens), [tokens])
  const inUse = useMemo(() => safeVariantsInUse(className, tokens), [className, tokens])
  const prefix = variantPrefix(variant)

  return (
    <div className="builder-styles__variants">
      <fieldset className="builder-styles__breakpoints" aria-label="Breakpoint">
        {BREAKPOINTS.map((bp) => (
          <button
            key={bp}
            type="button"
            className="builder-styles__chip"
            aria-pressed={variant.breakpoint === bp}
            title={bp === 'base' ? 'All screens (mobile first)' : `${widths[bp]}px and wider`}
            onClick={() => selectBreakpoint(store, widths, bp)}
          >
            <span className="builder-styles__chip-name">{bp}</span>
            <span className="builder-styles__chip-width">{bp === 'base' ? 'all' : widths[bp]}</span>
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
        {prefix ? (
          <>
            Editing classes with the <code>{prefix}</code> prefix
          </>
        ) : (
          'Editing base classes (all screens)'
        )}
      </p>
    </div>
  )
}
