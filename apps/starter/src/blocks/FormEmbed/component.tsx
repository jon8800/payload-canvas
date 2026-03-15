import type { ReactNode } from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { cn } from '@/lib/utils'
import { getBlockStyles, parseInlineCSS } from '@/lib/blockStyles'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { FormClient } from './FormClient'

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

export async function FormEmbedBlock({
  form,
  children,
  htmlTag = 'div',
  customClasses,
  inlineCSS,
  styles,
}: Props): Promise<ReactNode> {
  const { className, style } = getBlockStyles(styles)
  const Tag = htmlTag as keyof HTMLElementTagNameMap
  const formId = typeof form === 'object' ? form.id : form

  if (!formId) {
    return (
      <Tag
        className={cn(className, customClasses) || undefined}
        style={{
          ...style,
          ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
        }}
      >
        {children?.length ? <RenderBlocks blocks={children} /> : null}
      </Tag>
    )
  }

  let formData: any = null

  try {
    const payload = await getPayload({ config: configPromise })
    formData = await payload.findByID({
      collection: 'forms' as any,
      id: formId,
      depth: 0,
    })
  } catch {
    // Silent fail -- render children only if form fetch fails
  }

  const fields = formData?.fields ?? []
  const submitButtonLabel = formData?.submitButtonLabel ?? undefined
  const confirmationType = formData?.confirmationType ?? 'message'

  let confirmationMessage: string | undefined
  if (formData?.confirmationMessage) {
    const msg = formData.confirmationMessage
    if (typeof msg === 'string') {
      confirmationMessage = msg
    } else if (msg?.root?.children) {
      // Extract plain text from lexical rich text
      confirmationMessage = msg.root.children
        .map((node: any) => node.children?.map((c: any) => c.text).join('') ?? '')
        .join('\n')
    }
  }

  let redirectUrl: string | undefined
  if (formData?.redirect) {
    redirectUrl = formData.redirect.url || undefined
  }

  return (
    <Tag
      className={cn(className, customClasses) || undefined}
      style={{
        ...style,
        ...(inlineCSS ? parseInlineCSS(inlineCSS) : undefined),
      }}
    >
      {fields.length > 0 && (
        <FormClient
          formId={formId}
          fields={fields}
          submitButtonLabel={submitButtonLabel}
          confirmationType={confirmationType}
          confirmationMessage={confirmationMessage}
          redirectUrl={redirectUrl}
        />
      )}
      {children?.length ? <RenderBlocks blocks={children} /> : null}
    </Tag>
  )
}
