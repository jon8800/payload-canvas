// Design tokens for the Styles panel, read from the app's real Tailwind theme.
// Server-side only (index.ts calls it), but it has no file system access: it works on the
// recorded CanvasCssData, so it sees exactly the stylesheets the compile sees.
//
// Main path: Tailwind's design system API (`__unstable__loadDesignSystem`, the one Tailwind
// IntelliSense uses). It gives the full theme (including plugin themes) and the class list.
// Fallback: if a Tailwind upgrade removes or changes that API, parse the `@theme` blocks of the
// recorded stylesheets. The fallback has no class list and logs a warning.
import * as tailwind from 'tailwindcss'

import type { StyleTokens, ThemeToken } from '../core/types'
import type { TailwindPlugins } from './index'
import { type CanvasCssData, ENTRY_BASE, loadPlugin, splitTopLevel, stylesheetKey } from './shared'

/** Tailwind's ThemeOptions flags (a const enum in its types, so copied here). */
const INLINE = 1
const DEFAULT = 4

type ThemeEntry = { value: string; options: number }
type ThemeEntries = Iterable<[string, ThemeEntry]>

/** The part of Tailwind's DesignSystem this module uses. Checked at runtime. */
type DesignSystemLike = {
  theme: { entries(): ThemeEntries }
  getClassList(): [string, unknown][]
}

type LoadDesignSystem = (css: string, options: Parameters<typeof tailwind.compile>[1]) => Promise<unknown>

export type TokensSource = 'design-system' | 'theme-parse'

// ---------------------------------------------------------------------------------------------
// Main path: the design system API

async function loadDesignSystem(data: CanvasCssData, plugins?: TailwindPlugins): Promise<DesignSystemLike> {
  // Read the export by name, so a Tailwind version without it fails here, not at module link.
  const load = (tailwind as Record<string, unknown>)['__unstable__loadDesignSystem'] as LoadDesignSystem | undefined
  if (typeof load !== 'function') throw new Error('tailwindcss has no __unstable__loadDesignSystem export')
  const ds = (await load(data.entry, {
    base: ENTRY_BASE,
    loadStylesheet: (id, base) => {
      const sheet = data.stylesheets[stylesheetKey(id, base)]
      if (!sheet) return Promise.reject(new Error(`Stylesheet "${id}" (from "${base}") is not in the recorded input.`))
      return Promise.resolve(sheet)
    },
    loadModule: (id, base) => loadPlugin(id, base, plugins),
  })) as Partial<DesignSystemLike> | null
  if (typeof ds?.theme?.entries !== 'function' || typeof ds.getClassList !== 'function') {
    throw new Error('the design system has no theme.entries() or getClassList()')
  }
  return ds as DesignSystemLike
}

// ---------------------------------------------------------------------------------------------
// Fallback: parse the @theme blocks of the recorded stylesheets

const importId = (statement: string) => statement.match(/^@import\s+(?:url\()?\s*["']([^"']+)["']/)?.[1]

/** Every `@theme` declaration, in the order Tailwind applies them (imports expanded in place). */
export function parseThemeEntries(data: CanvasCssData): Map<string, ThemeEntry> {
  const theme = new Map<string, ThemeEntry>()

  const applyTheme = (params: string, body: string) => {
    const options = (/\binline\b/.test(params) ? INLINE : 0) | (/\bdefault\b/.test(params) ? DEFAULT : 0)
    for (const stmt of splitTopLevel(body)) {
      const decl = stmt.match(/^(--[\w-]+|--\*)\s*:\s*([\s\S]*?);?$/)
      if (!decl) continue
      const [, key, value] = decl
      // `--color-*: initial` clears a namespace; `--*: initial` clears the whole theme.
      if (value.trim() === 'initial') {
        const prefix = key === '--*' ? '--' : key.endsWith('-*') ? key.slice(0, -1) : null
        if (!prefix) {
          theme.delete(key)
          continue
        }
        // Deleting during Map iteration is safe in JS.
        for (const k of theme.keys()) {
          if (k.startsWith(prefix)) theme.delete(k)
        }
        continue
      }
      // A `@theme default` value never replaces a value the app already set.
      if (options & DEFAULT && theme.has(key)) continue
      // Map.set keeps the key's first position, as Tailwind's theme does.
      theme.set(key, { value: value.trim(), options })
    }
  }

  const walk = (css: string, base: string, depth: number) => {
    if (depth > 32) return
    for (const stmt of splitTopLevel(css)) {
      const id = stmt.startsWith('@import') ? importId(stmt) : undefined
      if (id) {
        const sheet = data.stylesheets[stylesheetKey(id, base)]
        if (sheet) walk(sheet.content, sheet.base, depth + 1)
        continue
      }
      const block = stmt.match(/^@theme\b([^{]*)\{([\s\S]*)\}$/)
      if (block) {
        applyTheme(block[1], block[2])
        continue
      }
      // Tailwind's own index.css wraps its @theme in `@layer theme { … }`.
      const layer = stmt.match(/^@layer\b[^{]*\{([\s\S]*)\}$/)
      if (layer) walk(layer[1], base, depth + 1)
    }
  }

  walk(data.entry, ENTRY_BASE, 0)
  return theme
}

// ---------------------------------------------------------------------------------------------
// Tokens from theme entries

type GroupName = Exclude<keyof StyleTokens, 'spacing' | 'classList'>

/**
 * Theme namespace and the utility that uses it, per token group. With a class list, a token is
 * kept only if `<utility><name>` is a real class, so the Styles panel never offers a value that
 * compiles to nothing. Breakpoints are variants, not classes.
 */
const GROUPS: Record<GroupName, { ns: string; utility: string | null }> = {
  colors: { ns: '--color', utility: 'bg-' },
  fontSizes: { ns: '--text', utility: 'text-' },
  fontWeights: { ns: '--font-weight', utility: 'font-' },
  fonts: { ns: '--font', utility: 'font-' },
  leading: { ns: '--leading', utility: 'leading-' },
  tracking: { ns: '--tracking', utility: 'tracking-' },
  radius: { ns: '--radius', utility: 'rounded-' },
  shadows: { ns: '--shadow', utility: 'shadow-' },
  breakpoints: { ns: '--breakpoint', utility: null },
  containers: { ns: '--container', utility: 'max-w-' },
}

const GROUP_BY_NS = new Map(Object.entries(GROUPS).map(([group, { ns }]) => [ns, group as GroupName]))

/**
 * Every namespace, longest first. A key goes to the longest namespace it matches, so
 * `--font-weight-bold` is a font weight (not a font) and `--text-shadow-sm` is not a font size.
 */
const ALL_NAMESPACES = [
  ...GROUP_BY_NS.keys(),
  '--text-shadow',
  '--inset-shadow',
  '--drop-shadow',
  '--spacing',
].toSorted((a, b) => b.length - a.length)

/** Spacing keys every Tailwind v4 theme with `--spacing` supports (it is a multiplier). */
const CONVENTIONAL_SPACING = [
  '0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96',
]

/** Color utilities that are keywords, not theme variables. */
const COLOR_KEYWORDS: ThemeToken[] = [
  { name: 'transparent', value: 'transparent' },
  { name: 'current', value: 'currentcolor' },
  { name: 'inherit', value: 'inherit' },
]

const isNumeric = (key: string) => /^\d+(\.\d+)?$/.test(key)

const spacingRank = (key: string) => (key === '0' ? -2 : key === 'px' ? -1 : isNumeric(key) ? Number(key) : Infinity)

/** Color family of a palette shade: red-500 -> red. */
const colorFamily = (name: string) => name.replace(/-\d+$/, '')

/** Spacing keys in scale order: 0, px, then numbers ascending, then named keys. */
function sortSpacing(keys: Iterable<string>): string[] {
  const unique = [...new Set(keys)]
  return unique.toSorted((a, b) => spacingRank(a) - spacingRank(b))
}

/** Breakpoint value in px, for sorting. Unknown units sort last, in theme order. */
function toPx(value: string): number {
  const match = value.trim().match(/^(-?[\d.]+)(px|rem|em)?$/)
  if (!match) return Infinity
  const n = Number(match[1])
  return match[2] === 'rem' || match[2] === 'em' ? n * 16 : n
}

type Token = ThemeToken & { options: number }

const strip = (list: Token[]): ThemeToken[] => list.map(({ name, value }) => ({ name, value }))

/** Theme colors first (in theme order), then black, white, the keywords, then the palette shades. */
function orderColors(colors: Token[], keywords: ThemeToken[]): ThemeToken[] {
  // Palette colors carry the DEFAULT flag. An app override of a palette shade (e.g. red-500)
  // stays in the palette, because its family (red) is a default family.
  const defaultFamilies = new Set(colors.filter((c) => c.options & DEFAULT).map((c) => colorFamily(c.name)))
  const isPalette = (c: Token) => Boolean(c.options & DEFAULT) || (/-\d+$/.test(c.name) && defaultFamilies.has(colorFamily(c.name)))
  const isBlackWhite = (c: Token) => c.name === 'black' || c.name === 'white'
  const palette = colors.filter(isPalette)
  return [
    ...strip(colors.filter((c) => !isPalette(c))),
    ...strip(palette.filter(isBlackWhite)),
    ...keywords,
    ...strip(palette.filter((c) => !isBlackWhite(c))),
  ]
}

export function tokensFromTheme(entries: ThemeEntries, classList: string[] | null): StyleTokens {
  const groups = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, [] as Token[]])) as Record<GroupName, Token[]>
  const namedSpacing: string[] = []
  let hasSpacingMultiplier = false

  for (const [key, { value, options }] of entries) {
    if (value === 'initial') continue
    if (key === '--spacing') hasSpacingMultiplier = true
    const ns = ALL_NAMESPACES.find((n) => key.startsWith(`${n}-`))
    if (!ns) continue
    const name = key.slice(ns.length + 1)
    // Skip nested keys such as `--text-xs--line-height`.
    if (!name || name.includes('--')) continue
    if (ns === '--spacing') namedSpacing.push(name)
    const group = GROUP_BY_NS.get(ns)
    if (group) groups[group].push({ name, value, options })
  }

  const classSet = classList ? new Set(classList) : null
  const valid = (group: GroupName): Token[] => {
    const { utility } = GROUPS[group]
    if (!classSet || !utility) return groups[group]
    return groups[group].filter((t) => classSet.has(`${utility}${t.name}`))
  }

  // Spacing: with a class list, the `p-<key>` classes are exactly what Tailwind accepts.
  const spacing = classList
    ? sortSpacing(classList.filter((c) => c.startsWith('p-') && !c.includes('[')).map((c) => c.slice(2)))
    : sortSpacing([...(hasSpacingMultiplier ? CONVENTIONAL_SPACING : []), ...namedSpacing])

  const breakpoints = strip(groups.breakpoints)
    .map((token, index) => ({ token, index, px: toPx(token.value) }))
    .toSorted((a, b) => a.px - b.px || a.index - b.index)
    .map(({ token }) => token)

  return {
    colors: orderColors(valid('colors'), COLOR_KEYWORDS.filter((k) => !classSet || classSet.has(`bg-${k.name}`))),
    spacing,
    fontSizes: strip(valid('fontSizes')),
    fontWeights: strip(valid('fontWeights')),
    fonts: strip(valid('fonts')),
    leading: strip(valid('leading')),
    tracking: strip(valid('tracking')),
    radius: strip(valid('radius')),
    shadows: strip(valid('shadows')),
    breakpoints,
    containers: strip(valid('containers')),
    classList: classList ?? [],
  }
}

// ---------------------------------------------------------------------------------------------
// Entry point

/**
 * Builds StyleTokens from a recorded CSS input. Uses the design system API; if it is missing or
 * throws, logs a warning and parses the @theme blocks instead (no class list in that case).
 */
export async function buildStyleTokens(
  data: CanvasCssData,
  plugins?: TailwindPlugins,
): Promise<{ tokens: StyleTokens; source: TokensSource }> {
  try {
    const ds = await loadDesignSystem(data, plugins)
    const classList = [...new Set(ds.getClassList().map((entry) => entry[0]))]
    return { tokens: tokensFromTheme(ds.theme.entries(), classList), source: 'design-system' }
  } catch (error) {
    console.warn(
      `[websiteBuilder] Tailwind's design system API failed, so style tokens come from parsing @theme ` +
        `(no class list for autocomplete). Cause: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { tokens: tokensFromTheme(parseThemeEntries(data), null), source: 'theme-parse' }
  }
}
