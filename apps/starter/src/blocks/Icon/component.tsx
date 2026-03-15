import type { ReactNode } from 'react'
import NextImage from 'next/image'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

const sizeMap = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const

type MediaUpload = {
  url?: string
  alt?: string
}

type Props = {
  icon?: MediaUpload | string
  name?: string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  size?: keyof typeof sizeMap
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function IconBlock({
  icon,
  name,
  children,
  htmlTag = 'span',
  customClasses,
  inlineCSS,
  size = 'md',
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const img = typeof icon === 'object' ? icon : undefined
  if (!img?.url) return null

  const px = sizeMap[size] ?? 24

  return (
    <Tag
      className={cn(className, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      <NextImage
        src={img.url}
        alt={name || img.alt || ''}
        width={px}
        height={px}
      />
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
