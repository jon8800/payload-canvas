'use client'

// Color control and its picker popover: theme colors, the palette grid, an opacity modifier
// and an arbitrary hex value. No color picker dependency.

import { useState, type CSSProperties, type RefObject } from 'react'

import type { ThemeToken } from '../../../core'
import { useRuntime } from '../runtime'
import { useStyles } from './context'
import { sourceHint, useProp } from './useProp'
import { arbitraryText, displayValue } from './model'
import { Popover, usePopover } from './popover'
import { colorGroups } from './tokens'

/** "red-500/50" -> { color: "red-500", alpha: 50 }. Slashes inside [brackets] belong to the color. */
export function splitColor(value: string): { color: string; alpha: number | null } {
  const end = value.startsWith('[') ? value.indexOf(']') + 1 : 0
  const slash = value.indexOf('/', end)
  if (slash === -1) return { color: value, alpha: null }
  const alpha = Number(value.slice(slash + 1))
  return { color: value.slice(0, slash), alpha: Number.isFinite(alpha) ? alpha : null }
}

const joinColor = (color: string, alpha: number | null) => (alpha === null || alpha >= 100 ? color : `${color}/${alpha}`)

// ---------------------------------------------------------------------------
// Swatch colors: theme values like var(--primary) are read from the canvas iframe.
// ---------------------------------------------------------------------------

const SIMPLE_VAR = /^var\((--[\w-]+)\)$/

function resolveIn(doc: Document | null, root: CSSStyleDeclaration | null, value: string): string | null {
  if (!value.includes('var(')) return value
  if (!doc || !root) return null
  let current = value
  for (let i = 0; i < 4; i++) {
    const match = SIMPLE_VAR.exec(current.trim())
    if (!match) break
    current = root.getPropertyValue(match[1]).trim()
    if (!current) return null
    if (!current.includes('var(')) return current
  }
  // Complex values (color-mix with vars): let the iframe compute them.
  const probe = doc.createElement('span')
  probe.style.color = 'rgb(1, 2, 3)'
  probe.style.color = current
  doc.body.append(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  return computed && computed !== 'rgb(1, 2, 3)' ? computed : null
}

const swatchCache = new WeakMap<ThemeToken[], Map<string, string | null>>()

/** CSS colors for the swatches. Cached once every var() resolved (the canvas CSS has loaded). */
function useSwatchColors(colors: ThemeToken[]): Map<string, string | null> {
  const { iframeRef } = useRuntime()
  return swatchColors(colors, iframeRef)
}

function swatchColors(colors: ThemeToken[], iframeRef: RefObject<HTMLIFrameElement | null>): Map<string, string | null> {
  const cached = swatchCache.get(colors)
  if (cached) return cached
  let doc: Document | null = null
  try {
    doc = iframeRef.current?.contentDocument ?? null
  } catch {
    doc = null
  }
  const root = doc?.documentElement ? getComputedStyle(doc.documentElement) : null
  const map = new Map<string, string | null>()
  let complete = true
  for (const token of colors) {
    const resolved = resolveIn(doc, root, token.value)
    if (resolved === null) complete = false
    map.set(token.name, resolved)
  }
  if (complete) swatchCache.set(colors, map)
  return map
}

/** CSS color for a model value, for the swatch. Null when unknown. */
function swatchFor(value: string, swatches: Map<string, string | null>, tokens: ThemeToken[]): string | null {
  const { color } = splitColor(value)
  const arbitrary = arbitraryText(color)
  if (arbitrary) return arbitrary
  if (swatches.has(color)) return swatches.get(color) ?? null
  const token = tokens.find((t) => t.name === color)
  return token && !token.value.includes('var(') ? token.value : null
}

function Swatch({ color, alpha, size }: { color: string | null; alpha?: number | null; size?: 'sm' }) {
  const style: CSSProperties | undefined = color
    ? { '--swatch': color, '--swatch-alpha': `${alpha ?? 100}%` } as CSSProperties
    : undefined
  return <span className={`builder-styles__swatch${size ? ' builder-styles__swatch--sm' : ''}`} data-empty={!color} style={style} />
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

export function ColorField({ prop }: { prop: string }) {
  const { tokens } = useStyles()
  const { def, value, isSet, set } = useProp(prop)
  const pop = usePopover('auto')
  // Resolve once for the button swatch too. Cheap: only var() values touch the iframe.
  const swatches = useSwatchColors(tokens.colors)
  if (!def) return null

  const current = value ? splitColor(value.value) : null
  const text = value ? displayValue(value) : ''

  return (
    <>
      <button
        type="button"
        className="builder-styles__color"
        data-source={value?.source ?? 'none'}
        title={sourceHint(value) ?? def.label}
        aria-label={`${def.label}: ${text || 'not set'}`}
        onClick={(e) => pop.toggle(e.currentTarget)}
      >
        <Swatch color={value ? swatchFor(value.value, swatches, tokens.colors) : null} alpha={current?.alpha} />
        <span className="builder-styles__color-text">{arbitraryText(current?.color ?? '') ?? (text || '–')}</span>
      </button>
      <Popover {...pop.props} label={def.label} className="builder-styles__popover--color">
        {pop.open && (
          <ColorPicker
            value={isSet ? value?.value ?? null : null}
            inherited={!isSet ? value?.value ?? null : null}
            onChange={(v) => set(v)}
          />
        )}
      </Popover>
    </>
  )
}

/**
 * Theme colors for the app's own UI parts (sidebar, charts, focus ring, form inputs). They stay
 * available, folded under "More theme colors", so the main list holds the colors a page uses.
 */
const DEVELOPER_COLOR = /^(?:sidebar|chart)(?:-|$)|^(?:ring|input)$/

export function isDeveloperColor(name: string): boolean {
  return DEVELOPER_COLOR.test(name)
}

function ThemeColors({
  tokens,
  current,
  swatches,
  onPick,
}: {
  tokens: ThemeToken[]
  current: string
  swatches: Map<string, string | null>
  onPick: (color: string) => void
}) {
  return (
    <div className="builder-styles__theme-colors">
      {tokens.map((token) => (
        <button
          key={token.name}
          type="button"
          className="builder-styles__theme-color"
          aria-pressed={current === token.name}
          title={`${token.name}: ${token.value}`}
          onClick={() => onPick(token.name)}
        >
          <Swatch color={swatches.get(token.name) ?? null} size="sm" />
          <span>{token.name}</span>
        </button>
      ))}
    </div>
  )
}

function ColorPicker({
  value,
  inherited,
  onChange,
}: {
  value: string | null
  inherited: string | null
  onChange: (value: string | null) => void
}) {
  const { tokens } = useStyles()
  const groups = colorGroups(tokens.colors)
  const main = groups.theme.filter((t) => !isDeveloperColor(t.name))
  const more = groups.theme.filter((t) => isDeveloperColor(t.name))
  const swatches = useSwatchColors(tokens.colors)
  const current = splitColor(value ?? inherited ?? '')
  const alpha = current.alpha ?? 100
  const [hex, setHex] = useState(() => {
    const text = arbitraryText(current.color)
    return text?.startsWith('#') ? text : ''
  })

  const pick = (color: string) => onChange(joinColor(color, current.alpha))
  const applyHex = () => {
    const text = hex.trim()
    if (/^#?[\da-f]{3,8}$/i.test(text)) pick(`[${text.startsWith('#') ? text : `#${text}`}]`)
  }

  return (
    <div className="builder-styles__picker">
      <div className="builder-styles__picker-head">
        <Swatch color={current.color ? swatchFor(current.color, swatches, tokens.colors) : null} alpha={alpha} />
        <span className="builder-styles__picker-value">{value ?? (inherited ? `${inherited} (inherited)` : 'Not set')}</span>
        {value && (
          <button type="button" className="builder-styles__link" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>

      {main.length > 0 && (
        <section>
          <p className="builder-styles__picker-title">Theme</p>
          <ThemeColors tokens={main} current={current.color} swatches={swatches} onPick={pick} />
          {more.length > 0 && (
            <details className="builder-styles__more-colors" open={more.some((t) => t.name === current.color)}>
              <summary>More theme colors ({more.length})</summary>
              <ThemeColors tokens={more} current={current.color} swatches={swatches} onPick={pick} />
            </details>
          )}
        </section>
      )}

      {groups.palette.length > 0 && (
        <section>
          <p className="builder-styles__picker-title">Palette</p>
          <div className="builder-styles__palette" style={{ '--shades': groups.palette[0].shades.length } as CSSProperties}>
            {groups.palette.map(({ hue, shades }) =>
              shades.map((token) => (
                <button
                  key={token.name}
                  type="button"
                  className="builder-styles__palette-cell"
                  aria-pressed={current.color === token.name}
                  aria-label={token.name}
                  title={token.name}
                  data-hue={hue}
                  style={{ background: token.value }}
                  onClick={() => pick(token.name)}
                />
              )),
            )}
          </div>
        </section>
      )}

      {tokens.colors.length === 0 && <p className="builder-styles__hint">Theme colors are loading or unavailable.</p>}

      <div className="builder-styles__picker-row">
        <span className="builder-styles__label">Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={alpha}
          disabled={!current.color}
          aria-label="Opacity"
          onChange={(e) => onChange(joinColor(current.color, Number(e.target.value)))}
        />
        <span className="builder-styles__slider-value">{alpha}%</span>
      </div>

      {/* No <form>: the editor sits inside Payload's document form, and a submit would save or reload. */}
      <div className="builder-styles__picker-row">
        <span className="builder-styles__label">Custom</span>
        <input
          type="color"
          className="builder-styles__native-color"
          aria-label="Pick a custom color"
          value={/^#[\da-f]{6}$/i.test(hex) ? hex : '#000000'}
          onChange={(e) => {
            setHex(e.target.value)
            pick(`[${e.target.value}]`)
          }}
        />
        <input
          className="builder-styles__input"
          placeholder="#ff8800"
          aria-label="Hex color"
          value={hex}
          spellCheck={false}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            applyHex()
          }}
        />
        <button type="button" className="builder-styles__button" onClick={applyHex}>
          Set
        </button>
      </div>
    </div>
  )
}
