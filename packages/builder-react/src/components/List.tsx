import { createElement } from 'react'
import type { BlockComponentProps } from '../render/types'
import { PlaceholderText } from './placeholder'

type Item = { id?: unknown; text?: unknown }

const isItem = (value: unknown): value is Item => typeof value === 'object' && value !== null

/** A `<ul>` (or `<ol>` when `ordered`) of text items. Empty items are skipped. */
export function List({ props, className, attributes, mode }: BlockComponentProps) {
  const items = (Array.isArray(props.items) ? props.items : [])
    .filter(isItem)
    .filter((item) => typeof item.text === 'string' && item.text)
  if (items.length === 0 && mode !== 'canvas') return null
  const children =
    items.length > 0
      ? items.map((item, i) => (
          // Array rows from Payload's inputs carry an id. Rows written by hand may not.
          <li key={typeof item.id === 'string' ? item.id : i}>{item.text as string}</li>
        ))
      : (
          <li>
            <PlaceholderText>List item</PlaceholderText>
          </li>
        )
  return createElement(props.ordered === true ? 'ol' : 'ul', { ...attributes, className }, children)
}
