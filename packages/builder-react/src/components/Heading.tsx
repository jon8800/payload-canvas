import { createElement } from 'react'
import type { BlockComponentProps } from '../render/types'

type Tag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

function toTag(level: unknown): Tag {
  const n = Number(level)
  if (!Number.isInteger(n) || n < 1 || n > 6) return 'h2'
  return `h${n}` as Tag
}

export function Heading({ props, className, attributes }: BlockComponentProps) {
  const text = typeof props.text === 'string' ? props.text : ''
  return createElement(toTag(props.level), { ...attributes, className }, text)
}
