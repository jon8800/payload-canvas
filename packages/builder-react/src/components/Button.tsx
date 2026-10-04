import { editableText } from '../render/editable'
import { linkAttributes } from '../render/link'
import type { BlockComponentProps } from '../render/types'
import { asText, PlaceholderText } from './placeholder'

/** An `<a>` when the link resolves to an href, otherwise a `<span>`. */
export function Button({ props, className, attributes, mode }: BlockComponentProps) {
  const label = asText(props.label)
  if (!label && mode !== 'canvas') return null
  const content = label || <PlaceholderText>Button</PlaceholderText>
  const link = linkAttributes(props.link)
  if (!link) {
    return (
      <span {...attributes} {...editableText(mode, 'label')} className={className}>
        {content}
      </span>
    )
  }
  return (
    <a {...attributes} {...editableText(mode, 'label')} {...link} className={className}>
      {content}
    </a>
  )
}
