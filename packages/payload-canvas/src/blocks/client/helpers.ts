// Helpers the block components use when they render. A leaf module (it imports only the marker
// class), so a client component that uses it ships no block definitions to the browser.
import { BUILDER_CSS_CLASS } from '../../css/marker'

type ClassTree = { readonly [key: string]: string | ClassTree }

/**
 * Adds the marker class to every class string of a map, nested maps too (see
 * `BUILDER_CSS_CLASS`). A component puts these strings on its own elements; its definition lists
 * them in `classes` (`classesOf`), so the generated CSS has them.
 */
export function classMap<T extends ClassTree>(map: T): T {
  const entries = Object.entries(map).map(([key, value]) => [key, typeof value === 'string' ? `${value} ${BUILDER_CSS_CLASS}` : classMap(value)])
  return Object.fromEntries(entries) as T
}

/** Plain string props: trimmed, or the fallback when empty. */
export const textOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

/** Prop name -> default text of a label (`{n}` and `{count}` are filled in where noted). */
export type ControlLabels = Record<string, string>

/**
 * A label: the prop, or the default when empty. `labels` are the defaults: the English text with
 * the site's labels over it. `values` fill `{n}`-style placeholders ("Slide {n} of {count}").
 */
export function labelOf(
  props: Record<string, unknown>,
  labels: ControlLabels,
  name: string,
  values: Record<string, string | number> = {},
): string {
  const template = textOr(props[name], labels[name] ?? '')
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

/** Class strings joined with spaces; empty and missing ones are left out. */
export const joinClasses = (...classes: (string | undefined)[]): string => classes.filter(Boolean).join(' ')
