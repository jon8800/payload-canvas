// Renders website builder layouts: a document's own layout (pages, posts, template parts) or a
// template rendered for a document.
import type { Payload } from 'payload'
import { normalizeLayout, type Layout, type TemplateContext } from '@payload-toolkit/builder/core'
import { loadLayoutData, RenderLayout } from '@payload-toolkit/builder-react'
import { builderBlocks, resolveLink } from '@/builder'
import { blockComponents } from '@/components/blocks'

/** A document with the plugin's layout field ("builder") and its generated CSS ("builderCss"). */
type BuilderDoc = { builder?: unknown; builderCss?: unknown }

type LayoutProps = {
  layout: Layout
  css: string | null
  payload: Payload
  draft: boolean
  /** The document a template renders (load it with depth 1). */
  context?: TemplateContext | null
}

export function generatedCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const css = (value as { css?: unknown }).css
  return typeof css === 'string' ? css : null
}

/** Loads a layout's data (documents, collection lists, bindings) and renders it. */
export async function BuilderLayout({ layout, css, payload, draft, context }: LayoutProps) {
  if (layout.blocks.length === 0) return null
  const loaded = await loadLayoutData(layout, builderBlocks, payload, { draft, context, resolveLink })
  return (
    <RenderLayout
      layout={loaded}
      blocks={builderBlocks}
      css={css}
      components={blockComponents}
      resolveLink={resolveLink}
      context={context}
    />
  )
}

/** A document's own builder layout. */
export function BuilderContent({ doc, payload, draft }: { doc: BuilderDoc; payload: Payload; draft: boolean }) {
  return <BuilderLayout layout={normalizeLayout(doc.builder)} css={generatedCss(doc.builderCss)} payload={payload} draft={draft} />
}
