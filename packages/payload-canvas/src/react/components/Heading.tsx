import { createElement, type ReactNode } from 'react'
import type { BlockComponentProps } from '../render/types'
import { editableText } from '../render/editable'
import { asText, PlaceholderText } from './placeholder'

type Tag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

function toTag(level: unknown): Tag {
  const n = Number(level)
  if (!Number.isInteger(n) || n < 1 || n > 6) return 'h2'
  return `h${n}` as Tag
}

/** The text with the first `accent` phrase in `<em>`. The plain text when the phrase is not in it. */
function withAccent(text: string, accent: string | undefined): ReactNode {
  const at = accent ? text.indexOf(accent) : -1
  if (!accent || at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <em>{accent}</em>
      {text.slice(at + accent.length)}
    </>
  )
}

export function Heading({ props, className, attributes, mode }: BlockComponentProps) {
  const text = asText(props.text)
  if (!text && mode !== 'canvas') return null
  const content = text ? withAccent(text, asText(props.accent)?.trim()) : <PlaceholderText>Heading</PlaceholderText>
  return createElement(toTag(props.level), { ...attributes, ...editableText(mode, 'text'), className }, content)
}
