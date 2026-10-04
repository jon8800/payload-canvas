'use client'

// Spacing diagram: margin as the outer ring, padding as the inner ring. Every side is an input:
// click, type a scale key, "-4" or "37px", press Enter. An empty value clears the side.

import type { ReactNode } from 'react'

import { useStyles } from './context'
import { OverrideFlag, ResetButton, spacingSuggestions, SubSection, suggestionsFor, ValueInput } from './controls'
import type { Suggestion } from './popover'
import { useProp } from './useProp'

type Ring = 'margin' | 'padding'
const SIDES = ['top', 'right', 'bottom', 'left'] as const

function Cell({ prop }: { prop: string }) {
  const { tokens } = useStyles()
  const { def } = useProp(prop)
  if (!def) return <span className="builder-styles__cell builder-styles__cell--empty" />
  return <ValueInput prop={prop} cell suggestions={spacingSuggestions(tokens)} />
}

function RingBox({ ring, children }: { ring: Ring; children: ReactNode }) {
  return (
    <div className={`builder-styles__ring builder-styles__ring--${ring}`}>
      <span className="builder-styles__ring-label">{ring}</span>
      {SIDES.map((side) => (
        <div key={side} className={`builder-styles__ring-${side}`}>
          <Cell prop={`${ring}-${side}`} />
        </div>
      ))}
      <div className="builder-styles__ring-inner">{children}</div>
    </div>
  )
}

/** Caption above a compact input, with a reset button when the value is set at this variant. */
export function MiniField({ prop, caption, suggestions }: { prop: string; caption: string; suggestions?: Suggestion[] }) {
  const { tokens } = useStyles()
  const { def } = useProp(prop)
  if (!def) return null
  return (
    <div className="builder-styles__mini">
      <span className="builder-styles__mini-caption">
        {caption}
        <OverrideFlag prop={prop} />
        <ResetButton prop={prop} />
      </span>
      <ValueInput prop={prop} suggestions={suggestions ?? suggestionsFor(def, tokens)} />
    </div>
  )
}

/** A label and up to four compact fields in one line. */
export function MiniRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="builder-styles__mini-row">
      <span className="builder-styles__label">{label}</span>
      <div className="builder-styles__mini-fields">{children}</div>
    </div>
  )
}

function Shortcuts({ ring }: { ring: Ring }) {
  return (
    <MiniRow label={ring === 'margin' ? 'Margin' : 'Padding'}>
      <MiniField prop={ring} caption="All" />
      <MiniField prop={`${ring}-x`} caption="X" />
      <MiniField prop={`${ring}-y`} caption="Y" />
    </MiniRow>
  )
}

export function BoxModel() {
  return (
    <div className="builder-styles__box-model">
      <RingBox ring="margin">
        <RingBox ring="padding">
          <span className="builder-styles__content-box" />
        </RingBox>
      </RingBox>
      {/* The diagram sets each side. "All sides" and X / Y wait behind a toggle. */}
      <SubSection title="All sides at once" props={['margin', 'margin-x', 'margin-y', 'padding', 'padding-x', 'padding-y']}>
        <Shortcuts ring="margin" />
        <Shortcuts ring="padding" />
      </SubSection>
    </div>
  )
}
