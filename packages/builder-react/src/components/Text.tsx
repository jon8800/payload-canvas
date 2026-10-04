import { Fragment, type ReactNode } from 'react'
import type { BlockComponentProps } from '../render/types'
import { editableText } from '../render/editable'
import { asText, PlaceholderText } from './placeholder'

/** Text with its line breaks kept as <br>. */
export function lines(text: string): ReactNode {
  return text.split(/\r?\n/).map((line, i) => (
    // Lines have no identity. The index is the only key and the list never reorders.
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ))
}

export function Text({ props, className, attributes, mode }: BlockComponentProps) {
  const text = asText(props.text)
  if (!text && mode !== 'canvas') return null
  return (
    <p {...attributes} {...editableText(mode, 'text')} className={className}>
      {text ? lines(text) : <PlaceholderText>Text</PlaceholderText>}
    </p>
  )
}
