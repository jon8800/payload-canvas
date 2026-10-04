'use client'

// Small controls shared by every section. Each one reads a property at the current variant
// and writes it through the editor store, so undo and redo work.

import { useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'

import type { Breakpoint, StylePropertyDef, StyleTokens } from '../../../core'
import { useRuntime } from '../runtime'
import { ColorField } from './ColorPicker'
import { useStyles, writeStyle } from './context'
import { ChevronIcon, ResetIcon } from './icons'
import { displayValue, parseTyped } from './model'
import { filterSuggestions, Popover, SuggestList, usePopover, type Suggestion } from './popover'
import { overrideHint, sourceHint, useProp } from './useProp'

/**
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y in a style control undo the editor, not the input: the value
 * is already applied, so the input has nothing of its own to undo.
 */
export function useUndoKeys(): (e: KeyboardEvent<HTMLElement>) => boolean {
  const { store } = useRuntime()
  return (e) => {
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (!mod || (key !== 'z' && key !== 'y')) return false
    e.preventDefault()
    e.stopPropagation()
    if (key === 'y' || e.shiftKey) store.redo()
    else store.undo()
    return true
  }
}

/** Switches the panel to another breakpoint (same state). */
function useEditBreakpoint(): (breakpoint: Breakpoint) => void {
  const { store } = useRuntime()
  const { variant } = useStyles()
  return (breakpoint) => store.setVariant({ ...variant, breakpoint })
}

/**
 * A small dot after a label: a larger breakpoint overrides this value on the canvas. Hover says
 * which class wins. A click opens a small popover to edit that breakpoint or remove the class.
 */
export function OverrideMark({ prop }: { prop: string }) {
  const runtime = useRuntime()
  const { blockId, tokens, error } = useStyles()
  const { def, override } = useProp(prop)
  const edit = useEditBreakpoint()
  const pop = usePopover('auto')
  if (!override) return null
  const breakpoint = override.variant.breakpoint
  const hint = overrideHint(override)
  return (
    <>
      <button
        type="button"
        className="builder-styles__override-mark"
        data-tooltip={`${hint}\nClick to edit ${breakpoint} or remove it.`}
        data-tooltip-side="top"
        aria-label={hint}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        onClick={(e) => pop.toggle(e.currentTarget)}
      />
      <Popover {...pop.props} label={`${def?.label ?? prop} override`} className="builder-styles__popover--override">
        <p className="builder-styles__override-text">
          <code>{override.className}</code> wins at {breakpoint} and wider, so the canvas does not show the value set here.
        </p>
        <div className="builder-styles__override-actions">
          <button
            type="button"
            className="builder-styles__button builder-styles__button--primary"
            onClick={() => {
              pop.hide()
              edit(breakpoint)
            }}
          >
            Edit {breakpoint}
          </button>
          <button
            type="button"
            className="builder-styles__button"
            onClick={() => {
              pop.hide()
              error.set(writeStyle(runtime, blockId, override.variant, tokens, prop, null))
            }}
          >
            Remove {override.className}
          </button>
        </div>
      </Popover>
    </>
  )
}

/** True when any of `props` has a value at the current variant (set, from a shorthand, or inherited). */
export function useAnyValue(props: string[]): boolean {
  const { read } = useStyles()
  return props.some((p) => read.get(p) !== null)
}

/**
 * A collapsible group inside a section ("As a child", "More sizing"). It starts open when one of
 * its `props` has a value, so a set value is never hidden.
 */
export function SubSection({ title, props, children }: { title: string; props: string[]; children: ReactNode }) {
  const hasValue = useAnyValue(props)
  const [open, setOpen] = useState(hasValue)
  return (
    <div className="builder-styles__sub" data-open={open}>
      <button type="button" className="builder-styles__sub-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="builder-styles__chevron">
          <ChevronIcon />
        </span>
        {title}
      </button>
      {open && <div className="builder-styles__sub-body">{children}</div>}
    </div>
  )
}

export function ResetButton({ prop }: { prop: string }) {
  const { isSet, set, def, value } = useProp(prop)
  return (
    <button
      type="button"
      className="builder-styles__reset"
      hidden={!isSet}
      onClick={() => set(null)}
      data-tooltip={isSet && value ? `Remove ${value.className}` : undefined}
      aria-label={`Reset ${def?.label ?? prop}`}
    >
      <ResetIcon />
    </button>
  )
}

/**
 * A property label. Blue when a class sets it at this breakpoint and state, amber when the value
 * comes from a smaller breakpoint or a shorthand; hover says which class. A dot follows it when a
 * larger breakpoint overrides the value on the canvas.
 */
export function PropLabel({ prop, label, className = 'builder-styles__label' }: { prop: string; label: string; className?: string }) {
  const { value } = useProp(prop)
  return (
    <span className="builder-styles__label-cell" data-source={value?.source ?? 'none'}>
      <span className={className} data-tooltip={sourceHint(value)} data-tooltip-side="top">
        {label}
      </span>
      <OverrideMark prop={prop} />
    </span>
  )
}

/** Label, control and reset button in one line. Hidden when the class model has no such property. */
export function Row({ prop, label, children }: { prop: string; label?: string; children?: ReactNode }) {
  const { def } = useProp(prop)
  if (!def) return null
  return (
    <div className="builder-styles__row">
      <PropLabel prop={prop} label={label ?? def.label} />
      <div className="builder-styles__control">{children ?? <AutoControl prop={prop} />}</div>
      <ResetButton prop={prop} />
    </div>
  )
}

/** Picks a control from the property kind. */
export function AutoControl({ prop }: { prop: string }) {
  const { def } = useProp(prop)
  const { tokens } = useStyles()
  if (!def) return null
  switch (def.kind) {
    case 'enum':
      return <EnumSelect prop={prop} />
    case 'color':
      return <ColorField prop={prop} />
    default:
      return <ValueInput prop={prop} suggestions={suggestionsFor(def, tokens)} />
  }
}

/** Suggestions for a value input, from the property kind. */
export function suggestionsFor(def: StylePropertyDef, tokens: StyleTokens): Suggestion[] {
  switch (def.kind) {
    case 'spacing':
      return spacingSuggestions(tokens)
    case 'token':
      return tokenSuggestions(tokens, def)
    case 'enum':
      return cached(def, 'options', () => (def.options ?? []).map((o) => ({ value: o.value, hint: o.label === o.value ? undefined : o.label })))
    default: {
      const values = Object.entries(NUMBER_VALUES).find(([prefix]) => def.id.startsWith(prefix))?.[1]
      return values ? cached(def, 'numbers', () => values.map((value) => ({ value }))) : []
    }
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i))

/** Common values for "number" properties, by property id prefix. */
const NUMBER_VALUES: Record<string, string[]> = {
  'border-width': ['0', '1', '2', '4', '8'],
  'grid-cols': [...range(1, 12), 'none', 'subgrid'],
  'grid-rows': [...range(1, 6), 'none', 'subgrid'],
  'col-span': [...range(1, 12), 'full'],
  'row-span': [...range(1, 6), 'full'],
  grow: ['0', '1'],
  shrink: ['0', '1'],
  order: ['first', 'last', 'none', ...range(1, 12)],
  'z-index': ['auto', '0', '10', '20', '30', '40', '50'],
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const suggestionCache = new WeakMap<object, Map<string, Suggestion[]>>()

function cached(owner: object, key: string, build: () => Suggestion[]): Suggestion[] {
  let map = suggestionCache.get(owner)
  if (!map) suggestionCache.set(owner, (map = new Map()))
  let list = map.get(key)
  if (!list) map.set(key, (list = build()))
  return list
}

/** Spacing scale keys with their pixel size: "4 · 16px". */
export function spacingSuggestions(tokens: StyleTokens): Suggestion[] {
  return cached(tokens, 'spacing', () =>
    tokens.spacing.map((key) => {
      if (key === 'px') return { value: key, hint: '1px' }
      const n = Number(key)
      return { value: key, hint: Number.isFinite(n) ? `${n * 4}px` : undefined }
    }),
  )
}

export function tokenSuggestions(tokens: StyleTokens, def: StylePropertyDef): Suggestion[] {
  const list = def.tokens ? tokens[def.tokens] : undefined
  if (!list) return []
  return cached(tokens, `token:${def.tokens}`, () => list.map((t) => ({ value: t.name, hint: shortValue(t.value) })))
}

const SIZE_KEYWORDS = ['auto', 'full', 'screen', 'svh', 'dvh', 'fit', 'min', 'max', 'px']
const FRACTIONS = ['1/2', '1/3', '2/3', '1/4', '3/4', '1/5', '2/5', '3/5', '4/5', '1/6', '5/6']

/** Width and height values: keywords, fractions, then the spacing scale. Max width adds containers. */
export function sizeSuggestions(tokens: StyleTokens, withContainers: boolean): Suggestion[] {
  return cached(tokens, `size:${withContainers}`, () => [
    ...SIZE_KEYWORDS.map((value) => ({ value })),
    ...(withContainers ? tokens.containers.map((t) => ({ value: t.name, hint: shortValue(t.value) })) : []),
    ...FRACTIONS.map((value) => ({ value })),
    ...spacingSuggestions(tokens).filter((s) => s.value !== 'px'),
  ])
}

function shortValue(value: string): string {
  return value.length > 28 ? `${value.slice(0, 26)}…` : value
}

// ---------------------------------------------------------------------------
// Value input (combobox)
// ---------------------------------------------------------------------------

/**
 * Text input with a suggestion list. Commits on Enter, on blur and on picking a suggestion.
 * An unset property shows the inherited value as a dimmed placeholder.
 */
export function ValueInput({
  prop,
  suggestions,
  cell = false,
  placeholder,
}: {
  prop: string
  suggestions: Suggestion[]
  /** Compact centered style for the box model. */
  cell?: boolean
  placeholder?: string
}) {
  const { def, value, isSet, set, override } = useProp(prop)
  const undoKeys = useUndoKeys()
  const listId = useId()
  const pop = usePopover('manual', true)
  const [draft, setDraft] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  // Escape blurs the input; the blur must not commit the abandoned draft.
  const cancelled = useRef(false)

  const shown = isSet ? displayValue(value) : ''
  const query = draft !== null && draft !== shown ? draft : ''
  const items = useMemo(() => filterSuggestions(suggestions, query), [suggestions, query])

  const commit = (text: string) => {
    setDraft(null)
    if (text.trim() === shown) return
    const parsed = parseTyped(text, def)
    set(parsed.value, { negative: parsed.negative })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // While typing, Ctrl+Z stays the input's own undo.
    if (draft === null && undoKeys(e)) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!pop.open) pop.show(e.currentTarget)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.max(0, Math.min(items.length - 1, i + step)))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const picked = pop.open && active >= 0 ? items[active] : undefined
      commit(picked ? picked.value : (draft ?? shown))
      pop.hide()
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      cancelled.current = true
      setDraft(null)
      pop.hide()
      e.currentTarget.blur()
    }
  }

  if (!def) return null
  const inheritedText = !isSet ? displayValue(value) : ''
  // Box model cells have no label: the tooltip names the side and where its value comes from.
  const cellHint = [def.label, override ? overrideHint(override) : sourceHint(value)].filter(Boolean).join('\n')

  return (
    <>
      <input
        className={cell ? 'builder-styles__cell' : 'builder-styles__input'}
        data-source={value?.source ?? 'none'}
        data-overridden={override ? true : undefined}
        value={draft ?? shown}
        placeholder={inheritedText || placeholder || (cell ? '–' : '')}
        data-tooltip={cell ? cellHint : undefined}
        aria-label={def.label}
        role="combobox"
        aria-expanded={pop.open}
        aria-controls={listId}
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => {
          e.currentTarget.select()
          if (suggestions.length > 0) pop.show(e.currentTarget)
          const current = suggestions.findIndex((s) => s.value === (shown || inheritedText))
          setActive(current)
        }}
        onBlur={(e) => {
          pop.hide()
          if (draft !== null && !cancelled.current) commit(e.currentTarget.value)
          cancelled.current = false
        }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setDraft(e.target.value)
          setActive(0)
          if (!pop.open && suggestions.length > 0) pop.show(e.currentTarget)
        }}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 && (
        <Popover {...pop.props} className="builder-styles__popover--list">
          <div id={listId}>
            {pop.open && (
              <SuggestList
                items={items}
                active={active}
                onHover={setActive}
                onPick={(item) => {
                  commit(item.value)
                  pop.hide()
                }}
              />
            )}
          </div>
        </Popover>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Enum controls
// ---------------------------------------------------------------------------

/** Option values may be the suffix ("row") or the full utility ("flex-row"). Match both. */
export function findOption(def: StylePropertyDef | undefined, names: string[]) {
  const options = def?.options ?? []
  return options.find((o) => names.includes(o.value)) ?? options.find((o) => names.some((n) => o.value.endsWith(`-${n}`)))
}

export function EnumSelect({ prop }: { prop: string }) {
  const { def, value, isSet, set } = useProp(prop)
  const undoKeys = useUndoKeys()
  if (!def?.options) return null
  const inherited = !isSet && value ? def.options.find((o) => o.value === value.value)?.label ?? value.value : null
  return (
    <select
      className="builder-styles__select"
      data-source={value?.source ?? 'none'}
      aria-label={def.label}
      value={isSet ? value?.value : ''}
      onChange={(e) => set(e.target.value || null)}
      onKeyDown={undoKeys}
    >
      <option value="">{inherited ? `${inherited} (inherited)` : '–'}</option>
      {def.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {isSet && value && !def.options.some((o) => o.value === value.value) && <option value={value.value}>{value.value}</option>}
    </select>
  )
}

export type SegmentItem = { match: string[]; label: string; icon?: ReactNode; text?: string }

/**
 * Icon buttons for the common options. When the property has options that are not in `items`,
 * a small select lists every option.
 */
export function Segmented({ prop, items, rotate }: { prop: string; items: SegmentItem[]; rotate?: 90 | -90 }) {
  const { def, value, isSet, set } = useProp(prop)
  if (!def?.options) return null
  const shownItems = items.flatMap((item) => {
    const option = findOption(def, item.match)
    return option ? [{ ...item, option }] : []
  })
  const covered = new Set(shownItems.map((i) => i.option.value))
  const extra = def.options.some((o) => !covered.has(o.value))
  const extraActive = !!value && !covered.has(value.value)

  return (
    <div className="builder-styles__segmented-wrap">
      <fieldset className="builder-styles__segmented" aria-label={def.label}>
        {shownItems.map(({ option, label, icon, text }) => {
          const active = value?.value === option.value
          return (
            <button
              key={option.value}
              type="button"
              className="builder-styles__segment"
              aria-pressed={active}
              data-source={active ? value?.source : undefined}
              data-tooltip={label}
              aria-label={label}
              onClick={() => set(active && isSet ? null : option.value)}
            >
              {icon ? (
                <span className="builder-styles__segment-icon" style={rotate ? { rotate: `${rotate}deg` } : undefined}>
                  {icon}
                </span>
              ) : (
                <span className="builder-styles__segment-text">{text ?? label}</span>
              )}
            </button>
          )
        })}
      </fieldset>
      {extra && (
        <select
          className="builder-styles__select builder-styles__select--more"
          data-source={extraActive ? value?.source : 'none'}
          aria-label={`More ${def.label} options`}
          data-tooltip="More options"
          value={extraActive ? value.value : ''}
          onChange={(e) => set(e.target.value || null)}
        >
          <option value="">…</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

/** A range input for numeric scales such as opacity (0–100 in steps of 5). */
export function SliderControl({ prop, min, max, step, unit = '' }: { prop: string; min: number; max: number; step: number; unit?: string }) {
  const { def, value, set } = useProp(prop)
  if (!def) return null
  const n = value && /^\d+$/.test(value.value) ? Number(value.value) : max
  return (
    <div className="builder-styles__slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={n}
        data-source={value?.source ?? 'none'}
        aria-label={def.label}
        onChange={(e) => set(e.target.value)}
      />
      <span className="builder-styles__slider-value" data-source={value?.source ?? 'none'}>
        {value ? `${displayValue(value)}${/^\d+$/.test(value.value) ? unit : ''}` : `${max}${unit}`}
      </span>
    </div>
  )
}
