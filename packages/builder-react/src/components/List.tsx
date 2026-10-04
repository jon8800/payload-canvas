import { createElement } from 'react'
import type { BlockComponentProps } from '../render/types'
import { editableText } from '../render/editable'
import { PlaceholderText } from './placeholder'

type Item = { id?: unknown; text?: unknown }

const isItem = (value: unknown): value is Item => typeof value === 'object' && value !== null

/**
 * True when a class sets the list style type, e.g. "list-disc", "md:list-none" or "list-[square]".
 * "list-inside", "list-outside" (position) and "list-image-*" do not count.
 */
export function hasListTypeClass(className: string | undefined): boolean {
  if (!className) return false
  return className.split(/\s+/).some((name) => {
    const utility = name.slice(name.lastIndexOf(':') + 1).replace(/^!|!$/g, '')
    return utility.startsWith('list-') && !/^list-(inside|outside|image-.*)$/.test(utility)
  })
}

/**
 * A `<ul>` (or `<ol>` when `ordered`) of text items. Empty items are skipped. Without a list-style
 * class it shows bullets (disc) or numbers (decimal) inline, so an ordered list never shows bullets.
 */
export function List({ props, className, attributes, mode }: BlockComponentProps) {
  // Keep each row's index in the stored array: the canvas edits `items.<index>.text`.
  const items = (Array.isArray(props.items) ? (props.items as unknown[]) : [])
    .map((item, index) => ({ item, index }))
    .filter((row): row is { item: Item; index: number } => isItem(row.item) && typeof row.item.text === 'string' && row.item.text !== '')
  if (items.length === 0 && mode !== 'canvas') return null
  const ordered = props.ordered === true
  const children =
    items.length > 0
      ? items.map(({ item, index }) => (
          // Array rows from Payload's inputs carry an id. Rows written by hand may not.
          <li key={typeof item.id === 'string' ? item.id : index} {...editableText(mode, `items.${index}.text`)}>
            {item.text as string}
          </li>
        ))
      : (
          <li>
            <PlaceholderText>List item</PlaceholderText>
          </li>
        )
  const style = hasListTypeClass(className) ? undefined : { listStyleType: ordered ? 'decimal' : 'disc' }
  return createElement(ordered ? 'ol' : 'ul', { ...attributes, className, style }, children)
}
