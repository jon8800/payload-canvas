import { BUILDER_CSS_CLASS } from '../../css/marker'

/**
 * Adds the marker class to every class string of a flat map (see `BUILDER_CSS_CLASS`). A built-in
 * component puts these strings on its own elements; its definition lists them in `classes`
 * (`classesOf`), so the generated CSS has them. Same rule as `withMarker` in `../defaults.ts`.
 */
export function classMap<T extends Record<string, string>>(map: T): T {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, `${value} ${BUILDER_CSS_CLASS}`])) as T
}

/** The classes of a class map, for a definition's `classes`, without the marker. */
export function classesOf(map: Record<string, string>): string[] {
  const all = Object.values(map).flatMap((value) => value.split(' '))
  return [...new Set(all)].filter((cls) => cls && cls !== BUILDER_CSS_CLASS)
}

/**
 * Block types that hold links or controls. Slots that render inside an `<a>`, a `<button>` or a
 * `<summary>` refuse them at any depth. A type that does not exist is ignored.
 */
export const INTERACTIVE = [
  'link',
  'button',
  'menu',
  'richText',
  'video',
  'collectionList',
  'form',
  'filterLink',
  'carousel',
  'lightbox',
  'accordion',
  'disclosure',
]

/** Plain string props: trimmed, or the fallback when empty. */
export const textOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback
