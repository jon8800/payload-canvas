import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

const heightMap: Record<string, string> = {
  xs: 'h-2',
  sm: 'h-4',
  md: 'h-8',
  lg: 'h-12',
  xl: 'h-16',
  '2xl': 'h-24',
}

type Props = {
  height?: string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function SpacerBlock({
  height = 'md',
  children,
  htmlTag = 'div',
  customClasses,
  inlineCSS,
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const heightClass = heightMap[height] ?? 'h-8'

  return (
    <Tag
      className={cn(className, heightClass, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
