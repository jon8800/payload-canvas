import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type Props = {
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  maxWidth?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  display?: 'block' | 'flex' | 'grid'
  flexDirection?: 'row' | 'col'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around'
  styles?: Record<string, any>
  blockType?: string
  blockPath?: string
  id?: string
}

export function ContainerBlock({
  children,
  htmlTag = 'div',
  customClasses,
  inlineCSS,
  maxWidth = 'none',
  display = 'block',
  flexDirection,
  alignItems,
  justifyContent,
  styles,
  blockPath,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const layoutClasses: string[] = []

  if (maxWidth && maxWidth !== 'none') {
    layoutClasses.push(`max-w-${maxWidth}`)
  }

  if (display === 'flex') {
    layoutClasses.push('flex')
    if (flexDirection) layoutClasses.push(`flex-${flexDirection}`)
    if (alignItems) layoutClasses.push(`items-${alignItems}`)
    if (justifyContent) layoutClasses.push(`justify-${justifyContent}`)
  } else if (display === 'grid') {
    layoutClasses.push('grid')
    if (alignItems) layoutClasses.push(`items-${alignItems}`)
    if (justifyContent) layoutClasses.push(`justify-${justifyContent}`)
  }

  return (
    <Tag
      className={cn(className, ...layoutClasses, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      {children?.length ? (
        <RenderBlocks blocks={children} basePath={blockPath ? `${blockPath}.children` : 'layout'} />
      ) : null}
    </Tag>
  )
}
