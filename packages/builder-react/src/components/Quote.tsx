import type { BlockComponentProps } from '../render/types'
import { asText, PlaceholderText } from './placeholder'
import { lines } from './Text'

/** `<blockquote>` with the quote in a `<p>` and the source in `<footer><cite>`. */
export function Quote({ props, className, attributes, mode }: BlockComponentProps) {
  const quote = asText(props.quote)
  const cite = asText(props.cite)
  if (!quote && mode !== 'canvas') return null
  return (
    <blockquote {...attributes} className={className}>
      <p>{quote ? lines(quote) : <PlaceholderText>Quote</PlaceholderText>}</p>
      {cite && (
        <footer>
          <cite>{cite}</cite>
        </footer>
      )}
    </blockquote>
  )
}
