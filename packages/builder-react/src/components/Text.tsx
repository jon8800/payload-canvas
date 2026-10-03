import { Fragment } from 'react'
import type { BlockComponentProps } from '../render/types'

export function Text({ props, className, attributes }: BlockComponentProps) {
  const text = typeof props.text === 'string' ? props.text : ''
  const lines = text.split(/\r?\n/)
  return (
    <p {...attributes} className={className}>
      {lines.map((line, i) => (
        // Lines have no identity. The index is the only key and the list never reorders.
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </p>
  )
}
