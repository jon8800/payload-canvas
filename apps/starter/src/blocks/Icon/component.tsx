import type { ReactNode } from 'react'
import NextImage from 'next/image'
import { getBlockStyles } from '@/lib/blockStyles'
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
      className={className || undefined}
      style={style}
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
