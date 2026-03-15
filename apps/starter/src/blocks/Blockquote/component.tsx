import type { ReactNode } from 'react'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { RichText } from '@payloadcms/richtext-lexical/react'

type Props = {
  content?: React.ComponentProps<typeof RichText>['data']
  citation?: string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function BlockquoteBlock({
  content,
  citation,
  children,
  htmlTag = 'blockquote',
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  return (
    <Tag
      className={className || undefined}
      style={style}
    >
      <blockquote>
        {content ? <RichText data={content} /> : null}
        {citation ? <cite>{citation}</cite> : null}
      </blockquote>
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
