// Renders a document's website builder layout (pages, posts and template parts).
import type { Payload } from 'payload'
import { normalizeLayout } from '@payload-toolkit/builder/core'
import { loadLayoutData, RenderLayout } from '@payload-toolkit/builder-react'
import { builderBlocks, resolveLink } from '@/builder'
import { blockComponents } from '@/components/blocks'

/** A document with the plugin's layout field ("builder") and its generated CSS ("builderCss"). */
type BuilderDoc = { builder?: unknown; builderCss?: unknown }

type Props = {
  doc: BuilderDoc
  payload: Payload
  draft: boolean
}

function generatedCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const css = (value as { css?: unknown }).css
  return typeof css === 'string' ? css : null
}

export async function BuilderContent({ doc, payload, draft }: Props) {
  const layout = normalizeLayout(doc.builder)
  if (layout.blocks.length === 0) return null

  const loaded = await loadLayoutData(layout, builderBlocks, payload, { draft })
  return (
    <RenderLayout
      layout={loaded}
      blocks={builderBlocks}
      css={generatedCss(doc.builderCss)}
      components={blockComponents}
      resolveLink={resolveLink}
    />
  )
}
