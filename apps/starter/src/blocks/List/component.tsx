import type { ReactNode } from 'react'
import { getBlockStyles } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type ListItem = {
  text: string
  id?: string
}

type Props = {
  items?: ListItem[]
  listType?: 'ordered' | 'unordered'
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function ListBlock({
  items,
  listType = 'unordered',
  children,
  htmlTag = 'div',
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap
  const ListTag = listType === 'ordered' ? 'ol' : 'ul'

  return (
    <Tag
      className={className || undefined}
      style={style}
    >
      {items?.length ? (
        <ListTag>
          {items.map((item, i) => (
            <li key={item.id ?? i}>{item.text}</li>
          ))}
        </ListTag>
      ) : null}
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
