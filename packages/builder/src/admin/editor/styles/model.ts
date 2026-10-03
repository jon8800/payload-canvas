'use client'

// Thin, cached wrappers around the class model in core/styles.ts.

import {
  getStyleProperty,
  getStyleValue,
  STYLE_PROPERTIES,
  type StyleGroup,
  type StylePropertyDef,
  type StyleTokens,
  type StyleValue,
  type Variant,
} from '../../../core'

const visible = new Set(STYLE_PROPERTIES.map((d) => d.id))

/** A property with a panel control. Hidden shorthands (rounded-t, inset-x) return undefined. */
export function propertyDef(id: string): StylePropertyDef | undefined {
  return visible.has(id) ? getStyleProperty(id) : undefined
}

export function propertiesIn(group: StyleGroup): StylePropertyDef[] {
  return STYLE_PROPERTIES.filter((d) => d.group === group)
}

export const variantKey = (v: Variant) => `${v.breakpoint}:${v.state}`

export const isBaseVariant = (v: Variant) => v.breakpoint === 'base' && v.state === 'default'

/** Reads style values of one className at one variant. Results are cached per reader. */
export type StyleReader = {
  get(property: string): StyleValue | null
}

export function createReader(className: string, variant: Variant, tokens: StyleTokens): StyleReader {
  const cache = new Map<string, StyleValue | null>()
  return {
    get(property) {
      if (cache.has(property)) return cache.get(property) ?? null
      let value: StyleValue | null = null
      try {
        value = getStyleValue(className, property, variant, tokens)
      } catch {
        // The class model is not ready, or the className has a class it cannot read.
        value = null
      }
      cache.set(property, value)
      return value
    },
  }
}

/** Text an input shows for a value: "-4" for a negative 4. */
export function displayValue(value: StyleValue | null): string {
  if (!value) return ''
  return value.negative ? `-${value.value}` : value.value
}

const KEYWORD = /^[a-z0-9][a-z0-9.-]*$/i
const FRACTION = /^\d+\/\d+$/

/**
 * Turns what the user typed into a model value. "" clears. "-4" is a negative 4 when the
 * property allows it. Scale keys, fractions and keywords stay as they are. Anything else
 * becomes an arbitrary value: "37px" -> "[37px]", "1fr auto" -> "[1fr_auto]".
 */
export function parseTyped(text: string, def: StylePropertyDef | undefined): { value: string | null; negative: boolean } {
  let value = text.trim()
  if (!value) return { value: null, negative: false }
  let negative = false
  if (def?.negative && value.startsWith('-') && value.length > 1) {
    negative = true
    value = value.slice(1)
  }
  if (value.startsWith('[') && value.endsWith(']')) return { value, negative }
  if (FRACTION.test(value)) return { value, negative }
  // A bare number with a unit ("37px", "2.5rem", "50%") is arbitrary; "4" or "1.5" is a scale key.
  if (/^[\d.]+(px|rem|em|%|vh|vw|svh|dvh|lvh|ch|ex|fr|deg|ms|s)$/.test(value)) return { value: `[${value}]`, negative }
  if (KEYWORD.test(value)) return { value, negative }
  return { value: `[${value.replace(/\s+/g, '_')}]`, negative }
}

/** "[#ff8800]" -> "#ff8800", "[1fr_auto]" -> "1fr auto". */
export function arbitraryText(value: string): string | null {
  if (!value.startsWith('[') || !value.endsWith(']')) return null
  return value.slice(1, -1).replaceAll('_', ' ')
}
