import { createElement, type ComponentType, type ReactNode } from 'react'
import { editableText } from '../render/editable'
import { linkAttributes } from '../render/link'
import type { BlockComponentProps } from '../render/types'
import type { IconMap } from './builtins/Icon'
import { asText, PlaceholderText } from './placeholder'

/** An `<a>` when the link resolves to an href, otherwise a `<span>`. Icon props are ignored. */
export function Button(props: BlockComponentProps) {
  return renderButton(props)
}

function renderButton({ props, className, attributes, mode }: BlockComponentProps, icons?: IconMap) {
  const label = asText(props.label)
  if (!label && mode !== 'canvas') return null
  const text = label || <PlaceholderText>Button</PlaceholderText>
  const link = linkAttributes(props.link)
  const name = asText(props.icon)
  const glyph = icons && name && Object.hasOwn(icons, name) ? icons[name] : undefined
  // Without an icon the label is the element's only content, as in 0.3.0. With one, the label
  // gets its own span, so inline editing on the canvas edits the text and not the icon.
  let content: ReactNode = text
  let editable = editableText(mode, 'label')
  if (glyph) {
    const icon = createElement(glyph, {
      'aria-hidden': true,
      focusable: 'false',
      className: asText(props.iconClassName) || undefined,
    })
    const labelSpan = <span {...editable}>{text}</span>
    content = props.iconPosition === 'start' ? <>{icon}{labelSpan}</> : <>{labelSpan}{icon}</>
    editable = {}
  }
  if (!link) {
    return (
      <span {...attributes} {...editable} className={className}>
        {content}
      </span>
    )
  }
  return (
    <a {...attributes} {...editable} {...link} className={className}>
      {content}
    </a>
  )
}

const byMap = new WeakMap<IconMap, ComponentType<BlockComponentProps>>()

/**
 * The `button` block's component for a site with an icon set: the `icon` prop
 * (`defaultBlocks({ icons })`) draws that icon before or after the label (`iconPosition`), with
 * the `iconClassName` classes. The icon is decoration: the label names the button.
 * `builtinComponents({ icons })` includes it. One component per map.
 */
export function buttonComponent(icons: IconMap): ComponentType<BlockComponentProps> {
  const known = byMap.get(icons)
  if (known) return known
  function IconButton(props: BlockComponentProps) {
    return renderButton(props, icons)
  }
  byMap.set(icons, IconButton)
  return IconButton
}
