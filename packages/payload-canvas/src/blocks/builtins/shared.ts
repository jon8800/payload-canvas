import type { Field } from 'payload'
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

/** Prop name -> English default of a control label (`{n}` and `{count}` are filled in where noted). */
export type ControlLabels = Record<string, string>

/**
 * A collapsed **Labels** group of localized text props, one per control label, with the English
 * text as the default. The props are flat (`props.closeLabel`); the group only folds them in the
 * inspector. A component reads each one with `labelOf(props, LABELS, name)`.
 */
export function labelsField(labels: ControlLabels, names: Record<string, string>): Field {
  return {
    type: 'collapsible',
    label: 'Labels',
    admin: {
      initCollapsed: true,
      description: 'The text of the controls, for screen readers and visible buttons. Translate them per locale.',
    },
    fields: Object.entries(labels).map(([name, text]) => ({
      name,
      type: 'text' as const,
      label: names[name] ?? name,
      defaultValue: text,
      localized: true,
      ...(text.includes('{') ? { admin: { description: `${braces(text)} are filled in.` } } : {}),
    })),
  }
}

const braces = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].join(' and ')

/**
 * A control label: the prop, or its English default when empty. `values` fill `{n}`-style
 * placeholders ("Slide {n} of {count}").
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

/** The AI description of a block's label props. */
export const labelsHelp = (labels: ControlLabels) =>
  ` Control labels (localized, English defaults): ${Object.entries(labels).map(([name, text]) => `"${name}" ("${text}")`).join(', ')}.`

/** Class strings joined with spaces; empty and missing ones are left out. */
export const joinClasses = (...classes: (string | undefined)[]): string => classes.filter(Boolean).join(' ')
