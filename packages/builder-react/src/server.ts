// Server-only helpers: `@payload-toolkit/builder-react/server`. They call Payload's Local API, so
// keep them out of client components (the main entry stays client-safe).

import type { Payload } from 'payload'
import { siteCssConfigOf } from '@payload-toolkit/builder'
import {
  collectClasses,
  DEFAULT_TEMPLATES_SLUG,
  DOCUMENT_TEMPLATE_FIELD,
  normalizeLayout,
  TEMPLATE_DEFAULT_FIELD,
  TEMPLATE_LAYOUT_FIELD,
  TEMPLATE_TARGET_FIELD,
  type Layout,
} from '@payload-toolkit/builder/core'
import { compileClasses } from '@payload-toolkit/builder/css'
import { isRecord } from './render/fields'

export { loadLayoutData, type LoadLayoutOptions } from './render/resolve'
export { loadTheme, ThemeStyle, type LoadedTheme, type ThemeStyleProps } from './theme/ThemeStyle'

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
  const layout = normalizeLayout(template[TEMPLATE_LAYOUT_FIELD])
  if (layout.blocks.length === 0) return null
  return { template, layout, css: cssOf(template) }
}

/** How many default templates `loadTemplate` looks at (one normally; more only with old data). */
const DEFAULT_CANDIDATES = 5

/**
 * The template a document renders through: the document's own template (its `template` field),
 * else the collection's default template, else `null`. Templates with an empty layout are
 * skipped: an empty own template falls back to the default, and an empty default falls back to
 * the next most recently changed default (the plugin refuses to publish an empty default, so
 * this only matters for older data).
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
    limit: DEFAULT_CANDIDATES,
    draft,
  })
  for (const candidate of result.docs as Doc[]) {
    const found = usable(candidate, collection, draft)
    if (found) return found
  }
  return null
}

/** One layout rendered on a page, with the CSS stored for it (used when the compile is not possible). */
export type PageCssPart = { layout: Layout; css?: string | null } | null | undefined

/**
 * One stylesheet for every layout a page renders (for example header, page or template, footer).
 *
 * Each layout's stored CSS is complete on its own, but several `<style>` tags on one page break
 * Tailwind's order: a later sheet's `text-lg` beats an earlier sheet's `md:text-xl`. Compiling
 * the union of the classes once keeps every variant after its base class, as on the canvas.
 *
 * Uses the plugin's CSS options (the Tailwind entry and plugins) from the Payload config. The
 * result is cached by class set, so a page costs one compile per distinct set of classes.
 * Without the plugin, or when the compile fails, it returns the stored CSS of the parts joined.
 * `null` when there is nothing to output.
 */
export async function compilePageCss(payload: Payload, parts: readonly PageCssPart[]): Promise<string | null> {
  const present = parts.filter((part): part is NonNullable<PageCssPart> => Boolean(part))
  const stored = () => present.map((part) => part.css ?? '').filter(Boolean).join('\n') || null
  const config = siteCssConfigOf(payload)
  if (!config) return stored()
  const classes = new Set<string>()
  for (const part of present) for (const name of collectClasses(part.layout, config.blocks)) classes.add(name)
  if (classes.size === 0) return null
  try {
    return (await compileClasses([...classes], config.css)) || null
  } catch (error) {
    payload.logger.error({ err: error, msg: '[builder] Page CSS compile failed. Using the stored CSS of each layout.' })
    return stored()
  }
}
