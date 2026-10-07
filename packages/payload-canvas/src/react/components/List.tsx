import { createElement } from 'react'
import { TEXT_LIST_SLOT } from '../../core'
import type { BlockComponentProps } from '../render/types'
import { editableText } from '../render/editable'
import { asText, PlaceholderText } from './placeholder'

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
 * Items of the old list shape (`props.items: [{ text }]`), before `normalizeLayout` moved them
 * into `listItem` blocks. Only layouts that were never saved since still have it. Empty rows are
 * skipped. Each row keeps its index in the stored array: the canvas edits `items.<index>.text`.
 */
function legacyItems(props: Record<string, unknown>, mode: BlockComponentProps['mode']) {
  if (!Array.isArray(props.items)) return null
  const rows = (props.items as unknown[])
    .map((item, index) => ({ item, index }))
    .filter((row): row is { item: Item; index: number } => isItem(row.item) && typeof row.item.text === 'string' && row.item.text !== '')
  if (rows.length === 0) return null
  return rows.map(({ item, index }) => (
    // Array rows from Payload's inputs carry an id. Rows written by hand may not.
    <li key={typeof item.id === 'string' ? item.id : index} {...editableText(mode, `items.${index}.text`)}>
      {item.text as string}
    </li>
  ))
}

/**
 * A `<ul>` (or `<ol>` when `ordered`). Its items are `listItem` blocks in the `items` slot. Without
 * a list-style class it shows bullets (disc) or numbers (decimal) inline, so an ordered list never
 * shows bullets. Nothing on the site when the list is empty.
 */
export function List({ block, props, className, attributes, slots, slotAttributes, mode }: BlockComponentProps) {
  const hasItems = (block.slots?.[TEXT_LIST_SLOT]?.length ?? 0) > 0
  const children = (hasItems ? null : legacyItems(props, mode)) ?? slots[TEXT_LIST_SLOT]
  if (!children && mode !== 'canvas') return null
  const ordered = props.ordered === true
  const style = hasListTypeClass(className) ? undefined : { listStyleType: ordered ? 'decimal' : 'disc' }
  return createElement(ordered ? 'ol' : 'ul', { ...attributes, ...slotAttributes[TEXT_LIST_SLOT], className, style }, children)
}

/**
 * One `<li>` of a list. Its text is edited in place on the canvas; Enter adds the next item and
 * Backspace at the start joins it to the item before. An empty item renders nothing on the site.
 */
export function ListItem({ props, className, attributes, mode }: BlockComponentProps) {
  const text = asText(props.text)
  if (text === '' && mode !== 'canvas') return null
  return (
    <li {...attributes} className={className} {...editableText(mode, 'text')}>
      {text === '' ? <PlaceholderText>List item</PlaceholderText> : text}
    </li>
  )
}
