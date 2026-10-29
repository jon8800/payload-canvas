import type { Field } from 'payload'
import { BUILDER_CSS_CLASS } from '../../css/marker'
import type { ControlLabels } from '../client/helpers'

// The render helpers live in a leaf module, so client components can import them alone.
export { classMap, joinClasses, labelOf, textOr, type ControlLabels } from '../client/helpers'

type ClassTree = { readonly [key: string]: string | ClassTree }

/** The classes of a class map (nested maps too), for a definition's `classes`, without the marker. */
export function classesOf(map: ClassTree): string[] {
  const strings = (tree: ClassTree): string[] => Object.values(tree).flatMap((value) => (typeof value === 'string' ? [value] : strings(value)))
  const all = strings(map).flatMap((value) => value.split(' '))
  return [...new Set(all)].filter((cls) => cls && cls !== BUILDER_CSS_CLASS)
}

/**
 * Block types that hold links or controls. A link block and slots that render inside a
 * `<button>` or a `<summary>` refuse them at any depth. `form` is a common custom block; a type
 * that does not exist is ignored.
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
  'imageViewer',
  'accordion',
  'disclosure',
]

const braces = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].join(' and ')

/**
 * One localized label prop. It stores no default: empty means the site's label
 * (`builtinComponents({ labels })`), else the English `text`, which the empty input shows.
 */
export function labelField(name: string, text: string, label: string): Field {
  const filled = text.includes('{') ? ` ${braces(text)} are filled in.` : ''
  return {
    name,
    type: 'text',
    label,
    localized: true,
    admin: { placeholder: text, description: `Empty: the site's default, "${text}" in English.${filled}` },
  }
}

/**
 * A collapsed **Labels** group of label props (`labelField`), one per key of `names`. The props
 * are flat (`props.closeLabel`); the group only folds them in the inspector. A component reads
 * each one with `labelOf(props, labels, name)`.
 */
export function labelsField(labels: ControlLabels, names: Record<string, string>): Field {
  return {
    type: 'collapsible',
    label: 'Labels',
    admin: {
      initCollapsed: true,
      description: 'The text of the controls, for screen readers and visible buttons. Translate them per locale.',
    },
    fields: Object.entries(names).map(([name, label]) => labelField(name, labels[name] ?? '', label)),
  }
}

/** The AI description of a block's label props. */
export const labelsHelp = (labels: ControlLabels) =>
  ` Labels (localized; leave them out to use the site's defaults): ${Object.entries(labels).map(([name, text]) => `"${name}" (English "${text}")`).join(', ')}.`

