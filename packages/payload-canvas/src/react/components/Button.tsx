import { editableText } from '../render/editable'
import { linkAttributes } from '../render/link'
import type { BlockComponentProps } from '../render/types'
import { asText, PlaceholderText } from './placeholder'

/** An `<a>` when the link resolves to an href, otherwise a `<span>`. */
export function Button({ props, className, attributes, mode, linkComponent }: BlockComponentProps) {
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
  // The site's link component (`RenderLayout`'s `linkComponent`), else a plain <a>.
  const A = linkComponent ?? 'a'
  return (
    <A {...attributes} {...editableText(mode, 'label')} {...link} className={className}>
      {content}
    </A>
  )
}
