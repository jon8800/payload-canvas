// Value checks that tell apart utilities sharing a prefix (text-lg vs text-red-500, border-2 vs
// border-red-500, font-bold vs font-sans, shadow-md vs shadow-red-500). Pure string checks.
import type { ThemeToken } from '../types'
import type { StyleTokenHints } from './types'

export type Accept = (value: string, tokens: StyleTokenHints) => boolean

export type ArbitraryType =
  | 'color'
  | 'length'
  | 'number'
  | 'percentage'
  | 'url'
  | 'image'
  | 'var'
  | 'family'
  | 'other'

const CSS_COLOR_KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'gray',
  'grey',
])

const HINT_TYPES: Record<string, ArbitraryType> = {
  color: 'color',
  length: 'length',
  'line-width': 'length',
  'absolute-size': 'length',
  'relative-size': 'length',
  percentage: 'percentage',
  number: 'number',
  integer: 'number',
  url: 'url',
  image: 'image',
  'family-name': 'family',
  'generic-name': 'family',
}

function hasName(list: ThemeToken[] | undefined, name: string): boolean {
  return Boolean(list?.some((token) => token.name === name))
}

/** Index of the last "/" outside brackets and parentheses, or -1. */
function modifierIndex(value: string): number {
  let depth = 0
  for (let i = value.length - 1; i >= 0; i--) {
    const char = value[i]
    if (char === ']' || char === ')') depth++
    else if (char === '[' || char === '(') depth--
    else if (char === '/' && depth === 0) return i
  }
  return -1
}

/** The value without its "/modifier" (opacity or line height): "red-500/50" → "red-500". */
export function withoutModifier(value: string): string {
  const index = modifierIndex(value)
  return index < 0 ? value : value.slice(0, index)
}

export function isArbitrary(value: string): boolean {
  return (value.startsWith('[') && value.endsWith(']')) || (value.startsWith('(') && value.endsWith(')'))
}

/**
 * For "[…]" and "(…)" values: the data type Tailwind infers, or null for a normal value.
 * Type hints win: "[length:var(--x)]" is a length, "(color:--x)" is a color.
 */
export function arbitraryType(value: string): ArbitraryType | null {
  if (!isArbitrary(value)) return null
  const isVarShorthand = value.startsWith('(')
  const inner = value.slice(1, -1)
  const hint = /^([a-z-]+):/.exec(inner)
  if (hint) return HINT_TYPES[hint[1]] ?? 'other'
  if (isVarShorthand || inner.startsWith('var(')) return 'var'
  if (
    /^#[0-9a-f]{3,8}$/i.test(inner) ||
    /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i.test(inner) ||
    CSS_COLOR_KEYWORDS.has(inner.toLowerCase())
  ) {
    return 'color'
  }
  if (inner.startsWith('url(')) return 'url'
  if (/^(repeating-)?(linear|radial|conic)-gradient\(/.test(inner) || inner.startsWith('image-set(')) return 'image'
  if (/^-?(\d*\.)?\d+%$/.test(inner)) return 'percentage'
  if (/^-?(\d*\.)?\d+$/.test(inner)) return 'number'
  if (/^-?(\d*\.)?\d+[a-z]+$/i.test(inner) || /^(calc|clamp|min|max)\(/.test(inner)) return 'length'
  return 'other'
}

/** A plain theme name: "primary", "red-500", "primary-foreground". */
function isName(value: string): boolean {
  return /^[a-z][\w-]*$/i.test(value) && !value.endsWith('-')
}

/** Any non-empty value. The default for prefixes no other property shares. */
export const anyValue: Accept = (value) => value.length > 0 && !value.endsWith('-')

/** A color name or arbitrary color, with an optional /opacity. */
export const isColor: Accept = (value) => {
  const base = withoutModifier(value)
  const type = arbitraryType(base)
  if (type) return type === 'color' || type === 'var'
  return isName(base)
}

/** Names that look like palette colors: red-500, slate-50, black, white. */
function looksLikeColor(value: string, tokens: StyleTokenHints): boolean {
  if (hasName(tokens.colors, value)) return true
  return /^[a-z]+-\d{2,3}$/.test(value) || ['black', 'white', 'transparent', 'current', 'inherit'].includes(value)
}

// --- text-* -----------------------------------------------------------------------------------

const TEXT_KEYWORDS = new Set([
  'left',
  'center',
  'right',
  'justify',
  'start',
  'end',
  'wrap',
  'nowrap',
  'balance',
  'pretty',
  'ellipsis',
  'clip',
])

/** text-xs … text-9xl, theme font sizes, text-[14px], text-(length:--x). "/7" sets line height. */
export const isFontSize: Accept = (value, tokens) => {
  const base = withoutModifier(value)
  const type = arbitraryType(base)
  if (type) return type === 'length' || type === 'percentage'
  if (hasName(tokens.fontSizes, base)) return true
  if (hasName(tokens.colors, base)) return false
  return /^(xs|sm|base|lg|\d*xl)$/.test(base)
}

/** Any other text-* name is a color: text-red-500, text-primary, text-[#fff], text-(--brand). */
export const isTextColor: Accept = (value, tokens) => {
  const base = withoutModifier(value)
  if (TEXT_KEYWORDS.has(base) || base.startsWith('shadow')) return false
  if (isFontSize(value, tokens)) return false
  return isColor(value, tokens)
}

// --- font-* -----------------------------------------------------------------------------------

const FONT_WEIGHTS = new Set([
  'thin',
  'extralight',
  'light',
  'normal',
  'medium',
  'semibold',
  'bold',
  'extrabold',
  'black',
])

/** font-bold, font-[550], font-(--weight). Tailwind reads an untyped variable as a weight. */
export const isFontWeight: Accept = (value, tokens) => {
  const type = arbitraryType(value)
  if (type) return type === 'number' || type === 'var'
  return FONT_WEIGHTS.has(value) || hasName(tokens.fontWeights, value)
}

/** Any other font-* name is a family: font-sans, font-heading, font-[Inter], font-(family-name:--x). */
export const isFontFamily: Accept = (value, tokens) => {
  if (isFontWeight(value, tokens)) return false
  if (value.startsWith('stretch-') || value.startsWith('features-')) return false
  const type = arbitraryType(value)
  if (type) return type === 'family' || type === 'other'
  return isName(value)
}

// --- border-* / rounded-* -----------------------------------------------------------------------

const SIDE_PREFIX = /^(t|r|b|l|x|y|s|e|tl|tr|br|bl|ss|se|es|ee)(-|$)/
const BORDER_KEYWORDS = new Set(['solid', 'dashed', 'dotted', 'double', 'hidden', 'none', 'collapse', 'separate'])

/** border-0, border-2, border-[3px], border-(length:--x). */
export const isBorderWidth: Accept = (value) => {
  const type = arbitraryType(value)
  if (type) return type === 'length' || type === 'number'
  return /^\d+$/.test(value)
}

/** border-red-500, border-primary/50, border-[#ccc]. Not side colors (border-t-red-500). */
export const isBorderColor: Accept = (value, tokens) => {
  if (SIDE_PREFIX.test(value) || BORDER_KEYWORDS.has(value) || value.startsWith('spacing')) return false
  if (isBorderWidth(value, tokens)) return false
  return isColor(value, tokens)
}

/** rounded-lg, rounded-full, rounded-[10px]. Not logical sides (rounded-s-lg). */
export const isRadius: Accept = (value) => anyValue(value, {}) && !SIDE_PREFIX.test(value)

// --- shadow-* ---------------------------------------------------------------------------------

const SHADOW_NAMES = new Set(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'none', 'inner'])

/**
 * shadow-md, shadow-lg/20, shadow-[0_0_4px_#000], shadow-(--card). A palette color (shadow-red-500)
 * or a known theme color is a shadow color, which the model does not manage.
 */
export const isShadow: Accept = (value, tokens) => {
  const base = withoutModifier(value)
  const type = arbitraryType(base)
  if (type) return type !== 'color'
  if (SHADOW_NAMES.has(base) || hasName(tokens.shadows, base)) return true
  if (looksLikeColor(base, tokens)) return false
  return isName(base)
}

// --- bg-* / gradients ---------------------------------------------------------------------------

const BG_KEYWORDS = new Set([
  'fixed',
  'local',
  'scroll',
  'cover',
  'contain',
  'auto',
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'none',
  'repeat',
  'no-repeat',
])
const BG_PREFIXES = [
  'clip-',
  'origin-',
  'repeat-',
  'size-',
  'position-',
  'blend-',
  'linear',
  'radial',
  'conic',
  'gradient',
  'top-',
  'bottom-',
  'left-',
  'right-',
]

/** bg-red-500, bg-primary/50, bg-[#fff], bg-(--brand). Not images, sizes or positions. */
export const isBackgroundColor: Accept = (value, tokens) => {
  if (BG_KEYWORDS.has(value) || BG_PREFIXES.some((prefix) => value.startsWith(prefix))) return false
  return isColor(value, tokens)
}

/** from-red-500, via-[#fff]. Not stop positions (from-10%, from-[20%]). */
export const isGradientStop: Accept = (value, tokens) => !value.endsWith('%') && isColor(value, tokens)

/** bg-linear-45, bg-linear-[25deg], bg-linear-(--angle). The to-* values are enum options. */
export const isGradientAngle: Accept = (value) => /^\d+$/.test(value) || isArbitrary(value)

/** Tailwind v3 name, still valid in v4: bg-gradient-to-r. */
export const isLegacyGradient: Accept = (value) => /^to-(t|tr|r|br|b|bl|l|tl)$/.test(value)

// --- other shared prefixes ----------------------------------------------------------------------

/** inset-0, inset-1/2. Not inset-x-0 (own property), inset-shadow-*, inset-ring-*. */
export const isInset: Accept = (value) =>
  anyValue(value, {}) && !/^(x|y|s|e)-/.test(value) && !value.startsWith('shadow') && !value.startsWith('ring')

/** flex-2, flex-1/2, flex-[2_2_0%]. flex-row, flex-wrap and friends belong to other properties. */
export const isFlexValue: Accept = (value) => /^\d+(\/\d+)?$/.test(value) || isArbitrary(value)

/** aspect-3/4, aspect-[4/3]. */
export const isAspectValue: Accept = (value) => /^\d+\/\d+$/.test(value) || isArbitrary(value)

/** space-x-4. Not space-x-reverse. */
export const isSpaceValue: Accept = (value) => anyValue(value, {}) && value !== 'reverse'

/** cursor-zoom-in, cursor-[url(…),_auto]. */
export const isCursorValue: Accept = (value) => isName(value) || isArbitrary(value)
