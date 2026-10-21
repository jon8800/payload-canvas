import { resolveBindings, type BlockDefinition, type Layout, type TemplateContext } from '../../core'

import { attachListItems, listQueries, resolveLayoutData, urlResolver, type ResolveLink } from '../index'
import { pageLinks, withPageParams } from '../render/lists'
import { attachSections } from '../render/sections'
import { createRestFetchDocs, fetchListPage } from './fetchDocs'

/** One shuffle per canvas: `$random` lists keep their order while someone edits. */
const CANVAS_SEED = Math.floor(Math.random() * 4_294_967_296)

/**
 * The layout as the canvas renders it: bound to the template's document (when there is one),
 * collection lists loaded, and upload and relationship IDs replaced with documents (over REST).
 * Documents load in `locale` (the editor's locale), as the site loads them in the page's locale.
 */
export async function resolveCanvasLayout(
  layout: Layout,
  context: TemplateContext | null,
  api: string,
  definitions: BlockDefinition[],
  resolveLink: ResolveLink,
  locale?: string | null,
  relations?: Record<string, Record<string, string>> | null,
): Promise<Layout> {
  const fetchDocs = createRestFetchDocs(api, locale)
  // Live saved sections: their current blocks, shown as repeats (not editable here).
  const withSections = await attachSections(layout, definitions, fetchDocs)
  const bound = context
    ? resolveBindings(withSections, context, definitions, { url: urlResolver(resolveLink), ...(relations ? { relations } : {}) })
    : withSections
  const queries = listQueries(bound, context)
  const lists = await Promise.all(queries.map((query) => fetchListPage(api, query, locale, CANVAS_SEED)))
  // A paginated list shows page 1 with its page links.
  const pages = new Map(queries.flatMap((query, i) => (query.page ? [[query.blockId, pageLinks(null, query.page, lists[i]!.totalPages, query.pageParam)] as const] : [])))
  const withItems = withPageParams(attachListItems(bound, new Map(queries.map((query, i) => [query.blockId, lists[i]!.docs])), pages), queries)
  return resolveLayoutData(withItems, definitions, fetchDocs)
}
