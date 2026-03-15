import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'

type Props = {
  form?: string | { id: string; [key: string]: unknown }
  children?: Array<{ blockType: string; id?: string; [key: string]: unknown }>
  htmlTag?: string
  customClasses?: string
  inlineCSS?: string
  styles?: Record<string, any>
  blockType?: string
  id?: string
}

export function FormEmbedBlock({
  form,
  children,
  htmlTag = 'div',
  customClasses,
  inlineCSS,
  styles,
}: Props): ReactNode {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap
  const formId = typeof form === 'object' ? form.id : form

  return (
    <Tag
      className={cn(className, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      <div data-form-id={formId}>
        {/* Form Builder frontend rendering -- integrate @payloadcms/plugin-form-builder/client in Phase 6 */}
        {/* Phase 6 will add: multi-step wizard, conditional field visibility, file upload UI */}
        <p>Form placeholder</p>
      </div>
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
