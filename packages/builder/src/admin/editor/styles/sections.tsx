'use client'

// One collapsible section per style group. Open state is remembered in localStorage.

import { useState, type ReactNode } from 'react'

import type { StyleGroup } from '../../../core'
import { BoxModel, MiniField, MiniRow } from './BoxModel'
import { useStyles } from './context'
import { AutoControl, Row, Segmented, sizeSuggestions, SliderControl, ValueInput, type SegmentItem } from './controls'
import type { Suggestion } from './popover'
import * as I from './icons'
import { propertiesIn, propertyDef } from './model'

// ---------------------------------------------------------------------------
// Collapsible sections
// ---------------------------------------------------------------------------

const OPEN_KEY = 'payload-builder:styles-open'
const DEFAULT_OPEN = ['layout', 'spacing', 'size', 'typography']
let openSet: Set<string> | null = null

function openSections(): Set<string> {
  if (openSet) return openSet
  try {
    const stored = localStorage.getItem(OPEN_KEY)
    openSet = new Set(stored ? (JSON.parse(stored) as string[]) : DEFAULT_OPEN)
  } catch {
    openSet = new Set(DEFAULT_OPEN)
  }
  return openSet
}

function useOpen(id: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => openSections().has(id))
  const toggle = () => {
    const set = openSections()
    if (open) set.delete(id)
    else set.add(id)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...set]))
    } catch {
      // Private mode or full storage: the state just is not remembered.
    }
    setOpen(!open)
  }
  return [open, toggle]
}

function Section({ group, title, children }: { group: StyleGroup; title: string; children: ReactNode }) {
  const { read } = useStyles()
  const [open, toggle] = useOpen(group)
  const props = propertiesIn(group)
  if (props.length === 0) return null
  const hasSet = props.some((d) => read.get(d.id)?.source === 'set')
  return (
    <section className="builder-styles__section" data-open={open}>
      <button type="button" className="builder-styles__section-head" aria-expanded={open} onClick={toggle}>
        <span className="builder-styles__chevron">
          <I.ChevronIcon />
        </span>
        {title}
        {hasSet && <span className="builder-styles__dot" title="Has values at this breakpoint and state" />}
      </button>
      {open && <div className="builder-styles__section-body">{children}</div>}
    </section>
  )
}

function SubSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, toggle] = useOpen(id)
  return (
    <div className="builder-styles__sub" data-open={open}>
      <button type="button" className="builder-styles__sub-head" aria-expanded={open} onClick={toggle}>
        <span className="builder-styles__chevron">
          <I.ChevronIcon />
        </span>
        {title}
      </button>
      {open && <div className="builder-styles__sub-body">{children}</div>}
    </div>
  )
}

/** Toggle for "edit each side / corner". Opens on its own when a side already has a value. */
function useSplit(props: string[]): [boolean, () => void] {
  const { read } = useStyles()
  const hasSide = props.some((p) => {
    const source = read.get(p)?.source
    return source === 'set' || source === 'inherited'
  })
  const [open, setOpen] = useState(hasSide)
  return [open || hasSide, () => setOpen(!open)]
}

function SplitToggle({ open, onToggle, label, icon }: { open: boolean; onToggle: () => void; label: string; icon: ReactNode }) {
  return (
    <button type="button" className="builder-styles__icon-button" aria-pressed={open} title={label} aria-label={label} onClick={onToggle}>
      {icon}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Option icons
// ---------------------------------------------------------------------------

const DISPLAY: SegmentItem[] = [
  { match: ['block'], label: 'Block', icon: <I.DisplayBlockIcon /> },
  { match: ['flex'], label: 'Flex', icon: <I.DisplayFlexIcon /> },
  { match: ['grid'], label: 'Grid', icon: <I.DisplayGridIcon /> },
  { match: ['inline-block'], label: 'Inline block', icon: <I.DisplayInlineIcon /> },
  { match: ['hidden', 'none'], label: 'Hidden', icon: <I.DisplayNoneIcon /> },
]
const DIRECTION: SegmentItem[] = [
  { match: ['row'], label: 'Row', icon: <I.ArrowRightIcon /> },
  { match: ['col', 'column'], label: 'Column', icon: <I.ArrowDownIcon /> },
  { match: ['row-reverse'], label: 'Row reverse', icon: <I.ArrowLeftIcon /> },
  { match: ['col-reverse', 'column-reverse'], label: 'Column reverse', icon: <I.ArrowUpIcon /> },
]
const WRAP: SegmentItem[] = [
  { match: ['nowrap'], label: 'No wrap', icon: <I.NoWrapIcon /> },
  { match: ['wrap'], label: 'Wrap', icon: <I.WrapIcon /> },
]
const JUSTIFY: SegmentItem[] = [
  { match: ['start'], label: 'Start', icon: <I.JustifyStartIcon /> },
  { match: ['center'], label: 'Center', icon: <I.JustifyCenterIcon /> },
  { match: ['end'], label: 'End', icon: <I.JustifyEndIcon /> },
  { match: ['between'], label: 'Space between', icon: <I.JustifyBetweenIcon /> },
  { match: ['around'], label: 'Space around', icon: <I.JustifyAroundIcon /> },
  { match: ['evenly'], label: 'Space evenly', icon: <I.JustifyEvenlyIcon /> },
]
const ALIGN: SegmentItem[] = [
  { match: ['start'], label: 'Start', icon: <I.AlignStartIcon /> },
  { match: ['center'], label: 'Center', icon: <I.AlignCenterIcon /> },
  { match: ['end'], label: 'End', icon: <I.AlignEndIcon /> },
  { match: ['stretch'], label: 'Stretch', icon: <I.AlignStretchIcon /> },
  { match: ['baseline'], label: 'Baseline', icon: <I.AlignBaselineIcon /> },
]
const TEXT_ALIGN: SegmentItem[] = [
  { match: ['left'], label: 'Left', icon: <I.TextLeftIcon /> },
  { match: ['center'], label: 'Center', icon: <I.TextCenterIcon /> },
  { match: ['right'], label: 'Right', icon: <I.TextRightIcon /> },
  { match: ['justify'], label: 'Justify', icon: <I.TextJustifyIcon /> },
]
const TRANSFORM: SegmentItem[] = [
  { match: ['normal-case', 'none'], label: 'None', text: '–' },
  { match: ['uppercase'], label: 'Uppercase', text: 'AA' },
  { match: ['capitalize'], label: 'Capitalize', text: 'Aa' },
  { match: ['lowercase'], label: 'Lowercase', text: 'aa' },
]
const DECORATION: SegmentItem[] = [
  { match: ['no-underline', 'none'], label: 'None', text: '–' },
  { match: ['underline'], label: 'Underline', icon: <span style={{ textDecoration: 'underline' }}>U</span> },
  { match: ['line-through'], label: 'Line through', icon: <span style={{ textDecoration: 'line-through' }}>S</span> },
  { match: ['overline'], label: 'Overline', icon: <span style={{ textDecoration: 'overline' }}>O</span> },
]
const FONT_STYLE: SegmentItem[] = [
  { match: ['not-italic', 'normal'], label: 'Normal', text: 'Aa' },
  { match: ['italic'], label: 'Italic', icon: <span style={{ fontStyle: 'italic', fontFamily: 'serif' }}>Aa</span> },
]
const BORDER_STYLE: SegmentItem[] = [
  { match: ['solid'], label: 'Solid', icon: <span className="builder-styles__line" data-style="solid" /> },
  { match: ['dashed'], label: 'Dashed', icon: <span className="builder-styles__line" data-style="dashed" /> },
  { match: ['dotted'], label: 'Dotted', icon: <span className="builder-styles__line" data-style="dotted" /> },
  { match: ['none'], label: 'None', text: '–' },
]

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function useValueOf(prop: string): string {
  return useStyles().read.get(prop)?.value ?? ''
}

function LayoutSection() {
  const { tokens } = useStyles()
  const display = useValueOf('display')
  const direction = useValueOf('flex-direction')
  const wrap = useValueOf('flex-wrap')
  const isFlex = /flex/.test(display)
  const isGrid = /grid/.test(display)
  const vertical = /col/.test(direction)

  return (
    <Section group="layout" title="Layout">
      <Row prop="display">
        <Segmented prop="display" items={DISPLAY} />
      </Row>
      {isFlex && (
        <>
          <Row prop="flex-direction" label="Direction">
            <Segmented prop="flex-direction" items={DIRECTION} />
          </Row>
          <Row prop="justify-content" label="Justify">
            <Segmented prop="justify-content" items={JUSTIFY} rotate={vertical ? 90 : undefined} />
          </Row>
          <Row prop="align-items" label="Align">
            <Segmented prop="align-items" items={ALIGN} rotate={vertical ? -90 : undefined} />
          </Row>
          <Row prop="flex-wrap" label="Wrap">
            <Segmented prop="flex-wrap" items={WRAP} />
          </Row>
          {/wrap/.test(wrap) && !/nowrap/.test(wrap) && <Row prop="align-content" label="Lines" />}
        </>
      )}
      {isGrid && (
        <>
          <Row prop="grid-cols" label="Columns" />
          <Row prop="grid-rows" label="Rows" />
          <Row prop="justify-content" label="Justify">
            <Segmented prop="justify-content" items={JUSTIFY} />
          </Row>
          <Row prop="align-items" label="Align">
            <Segmented prop="align-items" items={ALIGN} />
          </Row>
        </>
      )}
      {(isFlex || isGrid) && (
        <MiniRow label="Gap">
          <MiniField prop="gap" caption="All" />
          <MiniField prop="gap-x" caption="X" />
          <MiniField prop="gap-y" caption="Y" />
        </MiniRow>
      )}
      <SubSection id="layout-child" title="As a child">
        <Row prop="align-self" label="Align self">
          <Segmented prop="align-self" items={[{ match: ['auto'], label: 'Auto', text: 'Auto' }, ...ALIGN]} />
        </Row>
        <Row prop="flex" />
        <Row prop="grow" />
        <Row prop="shrink" />
        <Row prop="basis">
          <AutoOrSize prop="basis" suggestions={sizeSuggestions(tokens, false)} />
        </Row>
        <Row prop="order" />
        <Row prop="col-span" label="Col span" />
        <Row prop="row-span" label="Row span" />
      </SubSection>
      <SubSection id="layout-overflow" title="Overflow">
        <Row prop="overflow" />
        <Row prop="overflow-x" label="Overflow X" />
        <Row prop="overflow-y" label="Overflow Y" />
      </SubSection>
    </Section>
  )
}

/** Enum properties keep their select; the rest get a value input with size suggestions. */
function AutoOrSize({ prop, suggestions }: { prop: string; suggestions: Suggestion[] }) {
  if (propertyDef(prop)?.kind === 'enum') return <AutoControl prop={prop} />
  return <ValueInput prop={prop} suggestions={suggestions} />
}

function SpacingSection() {
  return (
    <Section group="spacing" title="Spacing">
      <BoxModel />
      <MiniRow label="Between">
        <MiniField prop="space-x" caption="X" />
        <MiniField prop="space-y" caption="Y" />
      </MiniRow>
    </Section>
  )
}

function SizeSection() {
  const { tokens } = useStyles()
  const size = sizeSuggestions(tokens, false)
  const maxWidth = sizeSuggestions(tokens, true)
  return (
    <Section group="size" title="Size">
      <MiniRow label="Size">
        <MiniField prop="width" caption="Width" suggestions={size} />
        <MiniField prop="height" caption="Height" suggestions={size} />
      </MiniRow>
      <MiniRow label="Min">
        <MiniField prop="min-width" caption="Width" suggestions={size} />
        <MiniField prop="min-height" caption="Height" suggestions={size} />
      </MiniRow>
      <MiniRow label="Max">
        <MiniField prop="max-width" caption="Width" suggestions={maxWidth} />
        <MiniField prop="max-height" caption="Height" suggestions={size} />
      </MiniRow>
      <Row prop="aspect-ratio" label="Ratio" />
      <Row prop="object-fit" label="Fit" />
    </Section>
  )
}

function PositionSection() {
  const position = useValueOf('position')
  const offsets = position !== '' && !/static/.test(position)
  return (
    <Section group="position" title="Position">
      <Row prop="position" />
      {offsets && (
        <>
          <MiniRow label="Inset">
            <MiniField prop="inset" caption="All" />
          </MiniRow>
          <MiniRow label="Sides">
            <MiniField prop="top" caption="Top" />
            <MiniField prop="right" caption="Right" />
            <MiniField prop="bottom" caption="Bottom" />
            <MiniField prop="left" caption="Left" />
          </MiniRow>
        </>
      )}
      <Row prop="z-index" label="Z index" />
    </Section>
  )
}

function TypographySection() {
  return (
    <Section group="typography" title="Typography">
      <Row prop="font-family" label="Font" />
      <Row prop="font-size" label="Size" />
      <Row prop="font-weight" label="Weight" />
      <Row prop="line-height" label="Height" />
      <Row prop="letter-spacing" label="Spacing" />
      <Row prop="text-color" label="Color" />
      <Row prop="text-align" label="Align">
        <Segmented prop="text-align" items={TEXT_ALIGN} />
      </Row>
      <Row prop="font-style" label="Style">
        <Segmented prop="font-style" items={FONT_STYLE} />
      </Row>
      <Row prop="text-transform" label="Case">
        <Segmented prop="text-transform" items={TRANSFORM} />
      </Row>
      <Row prop="text-decoration" label="Decoration">
        <Segmented prop="text-decoration" items={DECORATION} />
      </Row>
      <Row prop="white-space" label="Spaces" />
      <Row prop="text-wrap" label="Wrap" />
    </Section>
  )
}

function BackgroundSection() {
  const direction = useValueOf('gradient-direction')
  return (
    <Section group="background" title="Background">
      <Row prop="background-color" label="Color" />
      <Row prop="gradient-direction" label="Gradient" />
      {direction !== '' && (
        <>
          <Row prop="gradient-from" label="From" />
          <Row prop="gradient-via" label="Via" />
          <Row prop="gradient-to" label="To" />
        </>
      )}
    </Section>
  )
}

const CORNERS = ['radius-tl', 'radius-tr', 'radius-br', 'radius-bl']
const BORDER_SIDES = ['border-width-top', 'border-width-right', 'border-width-bottom', 'border-width-left']

function BorderSection() {
  const [corners, toggleCorners] = useSplit(CORNERS)
  const [sides, toggleSides] = useSplit(BORDER_SIDES)
  return (
    <Section group="border" title="Border">
      <Row prop="radius" label="Radius">
        <div className="builder-styles__with-toggle">
          <AutoControl prop="radius" />
          <SplitToggle open={corners} onToggle={toggleCorners} label="Each corner" icon={<I.CornersIcon />} />
        </div>
      </Row>
      {corners && (
        <MiniRow label="Corners">
          <MiniField prop="radius-tl" caption="TL" />
          <MiniField prop="radius-tr" caption="TR" />
          <MiniField prop="radius-br" caption="BR" />
          <MiniField prop="radius-bl" caption="BL" />
        </MiniRow>
      )}
      <Row prop="border-width" label="Width">
        <div className="builder-styles__with-toggle">
          <AutoControl prop="border-width" />
          <SplitToggle open={sides} onToggle={toggleSides} label="Each side" icon={<I.SidesIcon />} />
        </div>
      </Row>
      {sides && (
        <MiniRow label="Sides">
          <MiniField prop="border-width-top" caption="Top" />
          <MiniField prop="border-width-right" caption="Right" />
          <MiniField prop="border-width-bottom" caption="Bottom" />
          <MiniField prop="border-width-left" caption="Left" />
        </MiniRow>
      )}
      <Row prop="border-style" label="Style">
        <Segmented prop="border-style" items={BORDER_STYLE} />
      </Row>
      <Row prop="border-color" label="Color" />
    </Section>
  )
}

function EffectsSection() {
  return (
    <Section group="effects" title="Effects">
      <Row prop="opacity">
        <SliderControl prop="opacity" min={0} max={100} step={5} unit="%" />
      </Row>
      <Row prop="shadow" />
      <Row prop="cursor" />
    </Section>
  )
}

export function StyleSections() {
  return (
    <>
      <LayoutSection />
      <SpacingSection />
      <SizeSection />
      <PositionSection />
      <TypographySection />
      <BackgroundSection />
      <BorderSection />
      <EffectsSection />
    </>
  )
}
