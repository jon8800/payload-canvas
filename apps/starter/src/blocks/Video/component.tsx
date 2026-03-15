import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type MediaUpload = {
  url?: string
}

type Props = {
  source?: 'upload' | 'external'
  video?: MediaUpload | string
  url?: string
  poster?: MediaUpload | string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  controls?: boolean
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function VideoBlock({
  source = 'upload',
  video,
  url,
  poster,
  children,
  htmlTag = 'figure',
  customClasses,
  inlineCSS,
  autoplay = false,
  loop = false,
  muted = true,
  controls = true,
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const videoUrl =
    source === 'upload'
      ? typeof video === 'object'
        ? video?.url
        : undefined
      : url

  if (!videoUrl) return null

  const posterUrl = typeof poster === 'object' ? poster?.url : undefined

  return (
    <Tag
      className={cn(className, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      <video
        src={videoUrl}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        controls={controls}
        playsInline={autoplay}
        poster={posterUrl}
      />
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
