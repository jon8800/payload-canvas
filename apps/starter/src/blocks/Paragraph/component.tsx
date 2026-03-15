import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { RichText } from '@payloadcms/richtext-lexical/react'

type Props = {
  content?: React.ComponentProps<typeof RichText>['data']
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function ParagraphBlock({
  content,
  children,
  htmlTag = 'div',
  customClasses,
  inlineCSS,
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  return (
    <Tag
      className={cn(className, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      {content ? <RichText data={content} /> : null}
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
