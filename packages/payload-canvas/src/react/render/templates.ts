// Server only: which template a document renders through (`loadTemplate`). The order is the pure
// rule in core/templateChoice.ts; this module asks Payload's Local API for the data.

import type { Payload } from 'payload'
import {
  DEFAULT_TEMPLATES_SLUG,
  DOCUMENT_TEMPLATE_FIELD,
  normalizeLayout,
  TEMPLATE_CONDITIONS_FIELD,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_PRIORITY_FIELD,
  TEMPLATE_TARGET_FIELD,
  type Layout,
} from '../../core'
import { conditionedTemplates, defaultTemplates } from '../../core/templateChoice'
import { isRecord } from './fields'
import { withDateTokens } from './lists'
import { localeArgs, type LocaleArgs, type RenderLocale } from './locale'

type Doc = Record<string, unknown>

export type LoadedTemplate = {
  /** The template document (depth 0). */
  template: Doc
  layout: Layout
  /** The template's generated CSS, for `RenderLayout`'s `css`. */
  css: string | null
}

export type LoadTemplateArgs = RenderLocale & {
  /** Slug of the document's collection, e.g. "posts". */
  collection: string
  /** The document (any generated Payload type). Its `template` field may hold an ID or a loaded template. */
  // oxlint-disable-next-line typescript/no-explicit-any
  doc: Record<string, any>
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
  // Read with the render's `locale`, so the layout already holds that locale's values.
  const layout = normalizeLayout(template[TEMPLATE_LAYOUT_FIELD])
  if (layout.blocks.length === 0) return null
  return { template, layout, css: cssOf(template) }
}

/** How many templates of one collection `loadTemplate` looks at. */
const CANDIDATES = 100

/**
 * Whether the stored document matches a template's conditions: one Payload query, so every
 * operator and field path Payload knows works. Date tokens (`$now-30d`) become dates. A query Payload refuses (an unknown field) counts
 * as no match and is logged.
 */
async function matchesConditions(
  payload: Payload,
  collection: string,
  id: string | number,
  where: Record<string, unknown>,
  draft: boolean,
  locale: LocaleArgs,
): Promise<boolean> {
  try {
    const found = await payload.find({
      collection: collection as never,
      // Date tokens (`$now-30d`) work as in collection lists.
      where: { and: [{ id: { equals: id } }, withDateTokens(where) as never] },
      draft,
      depth: 0,
      limit: 1,
      pagination: false,
      select: { id: true } as never,
      ...locale,
    })
    return found.docs.length > 0
  } catch (error) {
    payload.logger.error({ err: error, msg: '[builder] Template conditions failed. The template is skipped.' })
    return false
  }
}

/**
 * `loadTemplate` with one more choice: `documentDraft` matches the conditions against the latest
 * draft of the document (the editor) while `draft: false` still uses published templates only.
 * Default: the same as `draft`.
 */
export async function findTemplate(payload: Payload, args: LoadTemplateArgs & { documentDraft?: boolean }): Promise<LoadedTemplate | null> {
  const { collection, doc } = args
  const slug = args.templatesSlug ?? DEFAULT_TEMPLATES_SLUG
  const draft = args.draft ?? false
  if (!(payload.collections as Record<string, unknown>)[slug]) return null
  // Localized sites: the template's localized props in the render's locale.
  const locale = localeArgs(args)
  const loadFull = async (id: unknown): Promise<LoadedTemplate | null> => {
    if (typeof id !== 'string' && typeof id !== 'number') return null
    try {
      return usable((await payload.findByID({ collection: slug as never, id, depth: 0, draft, ...locale })) as Doc, collection, draft)
    } catch {
      // A deleted template falls back to the next one.
      return null
    }
  }

  // 1. The document's own template.
  const own = doc[DOCUMENT_TEMPLATE_FIELD]
  const found = await loadFull(isRecord(own) ? own.id : own)
  if (found) return found

  // One light read of the collection's templates: only what the order needs, no layouts.
  const candidates = (
    await payload.find({
      collection: slug as never,
      where: { and: [{ [TEMPLATE_TARGET_FIELD]: { equals: collection } }, ...(draft ? [] : [{ _status: { equals: 'published' } }])] },
      sort: 'createdAt',
      depth: 0,
      limit: CANDIDATES,
      draft,
      select: {
        [TEMPLATE_CONDITIONS_FIELD]: true,
        [TEMPLATE_PRIORITY_FIELD]: true,
        [TEMPLATE_DEFAULT_FIELD]: true,
        createdAt: true,
        updatedAt: true,
      } as never,
      ...locale,
    })
  ).docs as Doc[]

  // 2. Templates with conditions: the match queries run at the same time; the order picks the winner.
  const conditioned = conditionedTemplates(candidates)
  const docId = doc.id
  if (conditioned.length > 0 && (typeof docId === 'string' || typeof docId === 'number')) {
    const documentDraft = args.documentDraft ?? draft
    const matched = await Promise.all(conditioned.map(({ where }) => matchesConditions(payload, collection, docId, where, documentDraft, locale)))
    for (const [i, { template }] of conditioned.entries()) {
      if (!matched[i]) continue
      const loaded = await loadFull(template.id)
      if (loaded) return loaded
    }
  }

  // 3. The default template. An empty default (older data) falls back to the next one.
  for (const template of defaultTemplates(candidates)) {
    const loaded = await loadFull(template.id)
    if (loaded) return loaded
  }
  return null
}

/**
 * The template a document renders through: the document's own template (its `template` field),
 * else the template with the highest `priority` whose `conditions` match the document (equal
 * priority: the older template), else the collection's default template, else `null`. Templates
 * with an empty layout are skipped. Costs one query for the template list, one per template with
 * conditions (in parallel, none without conditions) and one for the chosen template.
 *
 * Render it with the document as context. Load the document with the visitor's access, so the
 * template cannot show fields the visitor may not read (for example an author's email):
 *
 *   const post = await payload.find({ collection: 'posts', where, depth: 1, draft, overrideAccess: false, user })
 *   const found = await loadTemplate(payload, { collection: 'posts', doc: post, draft })
 *   const context = { collection: 'posts', doc: post }
 *   const layout = await loadLayoutData(found.layout, blocks, payload, { draft, context, resolveLink, user })
 *   <RenderLayout layout={layout} context={context} blocks={blocks} resolveLink={resolveLink} />
 */
export function loadTemplate(payload: Payload, args: LoadTemplateArgs): Promise<LoadedTemplate | null> {
  return findTemplate(payload, args)
}
