import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

const gapMap: Record<string, string> = {
  none: '0',
  xs: '1',
  sm: '2',
  md: '4',
  lg: '6',
  xl: '8',
}

type Props = {
  columns?: number
  gap?: string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  styles?: Record<string, any>
  blockType?: string
  blockPath?: string
  id?: string
}

export function GridBlock({
  columns = 2,
  gap = 'md',
  children,
  htmlTag = 'div',
  styles,
  blockPath,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const gapValue = gapMap[gap] ?? '4'

  return (
    <Tag
      className={
        cn(
          className,
          'grid',
          `grid-cols-${columns}`,
          `gap-${gapValue}`,
        ) || undefined
      }
      style={style}
    >
      {children?.length ? (
        <RenderBlocks blocks={children} basePath={blockPath ? `${blockPath}.children` : 'layout'} />
      ) : null}
    </Tag>
  )
}
