import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

const thicknessMap: Record<string, string> = {
  thin: 'border-t',
  normal: 'border-t-2',
  thick: 'border-t-4',
}

type Props = {
  style?: 'solid' | 'dashed' | 'dotted'
  thickness?: 'thin' | 'normal' | 'thick'
  color?: string
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function DividerBlock({
  style: borderStyle = 'solid',
  thickness = 'normal',
  color,
  children,
  htmlTag = 'div',
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap

  const thicknessClass = thicknessMap[thickness] ?? 'border-t-2'
  const borderStyleClass = `border-${borderStyle}`
  const colorClass = color && color !== 'none' ? `border-${color}` : ''

  return (
    <Tag
      className={className || undefined}
      style={style}
    >
      <hr
        className={cn(thicknessClass, borderStyleClass, colorClass) || undefined}
      />
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
