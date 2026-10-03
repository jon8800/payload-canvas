// Server-only helpers: `@payload-toolkit/builder-react/server`. They call Payload's Local API, so
// keep them out of client components (the main entry stays client-safe).

import type { Payload } from 'payload'
import {
  DEFAULT_TEMPLATES_SLUG,
  DOCUMENT_TEMPLATE_FIELD,
  normalizeLayout,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_TARGET_FIELD,
  type Layout,
} from '@payload-toolkit/builder/core'
import { isRecord } from './render/fields'

export { loadLayoutData, type LoadLayoutOptions } from './render/resolve'

type Doc = Record<string, unknown>

export type LoadedTemplate = {
  /** The template document (depth 0). */
  template: Doc
  layout: Layout
  /** The template's generated CSS, for `RenderLayout`'s `css`. */
  css: string | null
}

export type LoadTemplateArgs = {
  /** Slug of the document's collection, e.g. "posts". */
  collection: string
  /** The document. Its `template` field may hold an ID or a loaded template. */
  doc: Doc
  /** Slug of the templates collection. Default "builder-templates". */
  templatesSlug?: string
  /** Draft mode: use the latest template drafts. Otherwise only published templates. */
  draft?: boolean
}

/** The generated CSS stored next to a layout field (`{ hash, css }`). */
function cssOf(template: Doc): string | null {
  const value = template[`${TEMPLATE_LAYOUT_FIELD}Css`]
  return isRecord(value) && typeof value.css === 'string' ? value.css : null
}

function usable(template: Doc | null | undefined, collection: string, draft: boolean): LoadedTemplate | null {
  if (!template) return null
  if (template[TEMPLATE_TARGET_FIELD] !== collection) return null
  if (!draft && template._status === 'draft') return null
  const layout = normalizeLayout(template[TEMPLATE_LAYOUT_FIELD])
  if (layout.blocks.length === 0) return null
  return { template, layout, css: cssOf(template) }
}

/**
 * The template a document renders through: the document's own template (its `template` field),
 * else the collection's default template, else `null`. Templates with an empty layout are skipped.
 *
 * Render it with the document as context:
 *
 *   const post = await payload.find({ collection: 'posts', where, depth: 1, draft })  // depth 1: bound uploads load
 *   const found = await loadTemplate(payload, { collection: 'posts', doc: post, draft })
 *   const context = { collection: 'posts', doc: post }
 *   const layout = await loadLayoutData(found.layout, blocks, payload, { draft, context, resolveLink })
 *   <RenderLayout layout={layout} css={found.css} context={context} blocks={blocks} resolveLink={resolveLink} />
 */
export async function loadTemplate(payload: Payload, args: LoadTemplateArgs): Promise<LoadedTemplate | null> {
  const { collection, doc } = args
  const slug = args.templatesSlug ?? DEFAULT_TEMPLATES_SLUG
  const draft = args.draft ?? false
  if (!(payload.collections as Record<string, unknown>)[slug]) return null

  const own = doc[DOCUMENT_TEMPLATE_FIELD]
  const ownId = isRecord(own) ? own.id : own
  if (typeof ownId === 'string' || typeof ownId === 'number') {
    try {
      const template = (await payload.findByID({ collection: slug as never, id: ownId, depth: 0, draft })) as Doc
      const found = usable(template, collection, draft)
      if (found) return found
    } catch {
      // A deleted template falls back to the default.
    }
  }

  const result = await payload.find({
    collection: slug as never,
    where: {
      and: [
        { [TEMPLATE_TARGET_FIELD]: { equals: collection } },
        { [TEMPLATE_DEFAULT_FIELD]: { equals: true } },
        ...(draft ? [] : [{ _status: { equals: 'published' } }]),
      ],
    },
    sort: '-updatedAt',
    depth: 0,
    limit: 1,
    draft,
  })
  return usable(result.docs[0] as Doc | undefined, collection, draft)
}
