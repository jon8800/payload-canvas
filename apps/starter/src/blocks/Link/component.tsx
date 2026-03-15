import type { ReactNode } from 'react'
import NextLink from 'next/link'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { resolveHref, type LinkReference } from '@/lib/resolveHref'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type Props = {
  type?: 'internal' | 'external'
  url?: string
  reference?: LinkReference
  label?: string
  newTab?: boolean
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function LinkBlock({
  type = 'internal',
  url,
  reference,
  label,
  newTab = false,
  children,
  htmlTag = 'span',
  customClasses,
  inlineCSS,
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const href = resolveHref(type, url, reference)
  const isExternal = type === 'external'
  const targetProps = newTab
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : undefined

  return (
    <Tag
      className={cn(className, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      {isExternal ? (
        <a href={href} {...targetProps}>
          {label}
        </a>
      ) : (
        <NextLink href={href} {...targetProps}>
          {label}
        </NextLink>
      )}
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
