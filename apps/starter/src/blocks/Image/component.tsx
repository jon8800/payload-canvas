import type { ReactNode } from 'react'
import NextImage from 'next/image'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type MediaUpload = {
  url?: string
  alt?: string
  width?: number
  height?: number
}

type Props = {
  image?: MediaUpload | string
  alt?: string
  caption?: string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  objectFit?: 'cover' | 'contain' | 'fill' | 'none'
  aspectRatio?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function ImageBlock({
  image,
  alt,
  caption,
  children,
  htmlTag = 'figure',
  objectFit = 'cover',
  aspectRatio,
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const img = typeof image === 'object' ? image : undefined
  if (!img?.url) return null

  return (
    <Tag
      className={className || undefined}
      style={style}
    >
      <NextImage
        src={img.url}
        alt={alt || img.alt || ''}
        width={img.width || 800}
        height={img.height || 600}
        style={{
          objectFit,
          ...(aspectRatio && aspectRatio !== 'auto'
            ? { aspectRatio }
            : undefined),
        }}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
