import type { Payload } from 'payload'
import type { Layout } from '@payload-toolkit/builder/core'
import { loadLayoutData, RenderLayout } from '@payload-toolkit/builder-react'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { builderBlocks } from '@/builder'
import type { Page } from '@/payload-types'

type Props = {
  page: Page
  payload: Payload
  draft: boolean
}

function builderLayout(value: unknown): Layout | null {
  if (!value || typeof value !== 'object') return null
  const blocks = (value as Partial<Layout>).blocks
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  return value as Layout
}

function builderCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const css = (value as { css?: unknown }).css
  return typeof css === 'string' ? css : null
}

/** Renders the website builder layout. Pages without builder content fall back to the old blocks. */
export async function PageContent({ page, payload, draft }: Props) {
  const layout = builderLayout(page.builder)
  if (!layout) {
    return (
      <RenderBlocks
        blocks={(page.layout as any[]) || []}
        compiledBlockCSS={(page as any)._compiledBlockCSS}
      />
    )
  }

  const loaded = await loadLayoutData(layout, builderBlocks, payload, { draft })
  return <RenderLayout layout={loaded} blocks={builderBlocks} css={builderCss(page.builderCss)} />
}
