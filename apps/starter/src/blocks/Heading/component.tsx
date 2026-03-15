import type { ReactNode } from 'react'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

type Props = {
  text?: string
  tag?: HeadingTag
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function HeadingBlock({
  text,
  tag = 'h2',
  children,
  htmlTag = 'header',
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap
  const HeadingTag = tag

  return (
    <Tag
      className={className || undefined}
      style={style}
    >
      <HeadingTag>{text}</HeadingTag>
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
