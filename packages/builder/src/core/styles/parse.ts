// Splits classes into variants, important flag, negative flag, utility, property and value.
import { resolveUtility } from './properties'
import {
  BREAKPOINTS,
  STATES,
  type Breakpoint,
  type ParsedClass,
  type StyleState,
  type StyleTokenHints,
  type Variant,
} from './types'

/** A parsed class plus its variant. `variant` is null when a prefix is unknown (dark:, group-hover:). */
export type ParsedStyleClass = ParsedClass & { variant: Variant | null }

/** Splits on ":" outside brackets and parentheses: "[&>*]:bg-[url(a:b)]" → ["[&>*]", "bg-[url(a:b)]"]. */
function splitVariants(raw: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (char === '[' || char === '(') depth++
    else if (char === ']' || char === ')') depth = Math.max(0, depth - 1)
    else if (char === ':' && depth === 0) {
      parts.push(raw.slice(start, i))
      start = i + 1
    }
  }
  parts.push(raw.slice(start))
  return parts
}

/**
 * The variant for a list of prefixes, or null when a prefix is not one breakpoint (sm … 2xl) or
 * one state (hover, focus, active). Order does not matter: md:hover: and hover:md: are the same.
 */
export function parseVariant(prefixes: string[]): Variant | null {
  let breakpoint: Breakpoint = 'base'
  let state: StyleState = 'default'
  for (const prefix of prefixes) {
    if (breakpoint === 'base' && prefix !== 'base' && BREAKPOINTS.includes(prefix as Breakpoint)) {
      breakpoint = prefix as Breakpoint
    } else if (state === 'default' && prefix !== 'default' && STATES.includes(prefix as StyleState)) {
      state = prefix as StyleState
    } else {
      return null
    }
  }
  return { breakpoint, state }
}

/** The class prefix for a variant, breakpoint first: { md, hover } → "md:hover:", base/default → "". */
export function variantPrefix(variant: Variant): string {
  let prefix = ''
  if (variant.breakpoint !== 'base') prefix += `${variant.breakpoint}:`
  if (variant.state !== 'default') prefix += `${variant.state}:`
  return prefix
}

export function sameVariant(a: Variant, b: Variant): boolean {
  return a.breakpoint === b.breakpoint && a.state === b.state
}

export function parseClass(raw: string, tokens: StyleTokenHints = {}): ParsedStyleClass {
  const parts = splitVariants(raw)
  let utility = parts.pop() ?? ''
  let important = false
  let negative = false
  if (utility.startsWith('!')) {
    important = true
    utility = utility.slice(1)
  } else if (utility.endsWith('!')) {
    important = true
    utility = utility.slice(0, -1)
  }
  if (utility.startsWith('-')) {
    negative = true
    utility = utility.slice(1)
  }
  const resolved = utility ? resolveUtility(utility, negative, tokens) : null
  return {
    raw,
    variants: parts,
    utility,
    important,
    negative,
    property: resolved?.spec.id ?? null,
    value: resolved?.value ?? null,
    variant: parseVariant(parts),
  }
}

export function splitClassName(className: string): string[] {
  return className.split(/\s+/).filter(Boolean)
}

export function parseClasses(className: string, tokens: StyleTokenHints = {}): ParsedStyleClass[] {
  return splitClassName(className).map((raw) => parseClass(raw, tokens))
}

/** Splits a className into classes, one entry per class, in order. Whitespace is ignored. */
export function parseClassName(className: string, tokens: StyleTokenHints = {}): ParsedClass[] {
  return parseClasses(className, tokens).map(({ variant: _variant, ...parsed }) => parsed)
}
