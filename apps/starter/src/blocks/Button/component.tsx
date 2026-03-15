import type { ReactNode } from 'react'
import NextLink from 'next/link'
import { getBlockStyles } from '@/lib/blockStyles'
import { buttonVariants } from '@/components/ui/button'
import { resolveHref, type LinkReference } from '@/lib/resolveHref'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type Props = {
  type?: 'internal' | 'external'
  url?: string
  reference?: LinkReference
  label?: string
  newTab?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function ButtonBlock({
  type = 'internal',
  url,
  reference,
  label,
  newTab = false,
  variant = 'default',
  size = 'default',
  children,
  htmlTag = 'div',
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const href = resolveHref(type, url, reference)
  const isExternal = type === 'external'
  const btnClasses = buttonVariants({ variant, size })
  const targetProps = newTab
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : undefined

  return (
    <Tag
      className={className || undefined}
      style={style}
    >
      {isExternal ? (
        <a href={href} className={btnClasses} {...targetProps}>
          {label}
        </a>
      ) : (
        <NextLink href={href} className={btnClasses} {...targetProps}>
          {label}
        </NextLink>
      )}
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
