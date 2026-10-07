'use client'

// Style tokens for the Styles panel. Fetched once per editor session and cached in module scope.

import { useSyncExternalStore } from 'react'

import type { Breakpoint, StyleTokens, ThemeToken } from '../../../core'

type Entry = { tokens: StyleTokens | null; error: string | null; loading: boolean }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of listeners) listener()
}

function load(endpoint: string) {
  entries.set(endpoint, { tokens: null, error: null, loading: true })
  fetch(endpoint, { credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return (await res.json()) as StyleTokens
    })
    .then((tokens) => entries.set(endpoint, { tokens, error: null, loading: false }))
    .catch((error: unknown) =>
      entries.set(endpoint, { tokens: null, error: error instanceof Error ? error.message : String(error), loading: false }),
    )
    .finally(notify)
}

const EMPTY_ENTRY: Entry = { tokens: null, error: null, loading: true }

/** Tokens from `endpoint`, or `null` while they load or after an error. */
export function useStyleTokens(endpoint: string): Entry {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      if (!entries.has(endpoint)) load(endpoint)
      return () => {
        listeners.delete(listener)
      }
    },
    () => entries.get(endpoint) ?? EMPTY_ENTRY,
    () => EMPTY_ENTRY,
  )
}

export function reloadStyleTokens(endpoint: string) {
  load(endpoint)
  notify()
}

/** Used until the tokens arrive, and for anything the endpoint leaves out. */
export const FALLBACK_TOKENS: StyleTokens = {
  colors: [],
  spacing: ['0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96'],
  fontSizes: [],
  fontWeights: [],
  fonts: [],
  leading: [],
  tracking: [],
  radius: [],
  shadows: [],
  breakpoints: [
    { name: 'sm', value: '40rem' },
    { name: 'md', value: '48rem' },
    { name: 'lg', value: '64rem' },
    { name: 'xl', value: '80rem' },
    { name: '2xl', value: '96rem' },
  ],
  containers: [],
  classList: [],
}

export function withFallback(tokens: StyleTokens | null): StyleTokens {
  if (!tokens) return FALLBACK_TOKENS
  return {
    ...tokens,
    spacing: tokens.spacing?.length ? tokens.spacing : FALLBACK_TOKENS.spacing,
    breakpoints: tokens.breakpoints?.length ? tokens.breakpoints : FALLBACK_TOKENS.breakpoints,
  }
}

/** "40rem" -> 640, "768px" -> 768. Null for anything else. */
export function toPx(value: string): number | null {
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim())
  if (!match) return null
  const n = Number(match[1])
  return match[2] === 'rem' || match[2] === 'em' ? n * 16 : n
}

// ---------------------------------------------------------------------------
// Breakpoints and canvas widths
// ---------------------------------------------------------------------------

export const BREAKPOINTS: Breakpoint[] = ['base', 'sm', 'md', 'lg', 'xl', '2xl']

/** Canvas width for the "base" breakpoint and the mobile device. */
export const MOBILE_WIDTH = 390
export const TABLET_WIDTH = 768

const DEFAULT_PX: Record<Breakpoint, number> = { base: 0, sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 }

/** Minimum width of each breakpoint in px. "base" is 0. */
export function breakpointWidths(tokens: StyleTokens): Record<Breakpoint, number> {
  const widths = { ...DEFAULT_PX }
  for (const token of tokens.breakpoints) {
    const px = toPx(token.value)
    if (px !== null && token.name in widths) widths[token.name as Breakpoint] = px
  }
  return widths
}

/** The largest breakpoint active at `width`. */
export function breakpointAt(widths: Record<Breakpoint, number>, width: number): Breakpoint {
  let match: Breakpoint = 'base'
  for (const bp of BREAKPOINTS) if (widths[bp] <= width) match = bp
  return match
}

/** Canvas width that shows a breakpoint: its minimum width, or a phone width for "base". */
export function canvasWidthFor(widths: Record<Breakpoint, number>, bp: Breakpoint): number {
  return bp === 'base' ? MOBILE_WIDTH : widths[bp]
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export type PaletteHue = { hue: string; shades: ThemeToken[] }
export type ColorGroups = { theme: ThemeToken[]; palette: PaletteHue[] }

const SHADE = /^([a-z]+)-(50|[1-9]00|950)$/
const colorGroupsCache = new WeakMap<ThemeToken[], ColorGroups>()

/** Splits theme colors (primary, muted, …) from the default palette (red-50 … red-950). */
export function colorGroups(colors: ThemeToken[]): ColorGroups {
  const cached = colorGroupsCache.get(colors)
  if (cached) return cached
  const hues = new Map<string, ThemeToken[]>()
  for (const token of colors) {
    const match = SHADE.exec(token.name)
    if (!match) continue
    const list = hues.get(match[1]) ?? []
    list.push(token)
    hues.set(match[1], list)
  }
  const palette: PaletteHue[] = []
  const inPalette = new Set<string>()
  for (const [hue, shades] of hues) {
    // A palette hue has a full shade ramp. "chart-1"-style names are theme colors.
    if (shades.length < 5) continue
    shades.sort((a, b) => Number(SHADE.exec(a.name)?.[2]) - Number(SHADE.exec(b.name)?.[2]))
    palette.push({ hue, shades })
    for (const s of shades) inPalette.add(s.name)
  }
  const groups = { theme: colors.filter((c) => !inPalette.has(c.name)), palette }
  colorGroupsCache.set(colors, groups)
  return groups
}
