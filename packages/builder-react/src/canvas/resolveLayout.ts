import { resolveBindings, type BlockDefinition, type Layout, type TemplateContext } from '@payload-toolkit/builder/core'

import { attachListItems, listQueries, resolveLayoutData, urlResolver, type ResolveLink } from '../index'
import { createRestFetchDocs, fetchListItems } from './fetchDocs'

/**
 * The layout as the canvas renders it: bound to the template's document (when there is one),
 * collection lists loaded, and upload and relationship IDs replaced with documents (over REST).
 */
export async function resolveCanvasLayout(
  layout: Layout,
  context: TemplateContext | null,
  api: string,
  definitions: BlockDefinition[],
  resolveLink: ResolveLink,
): Promise<Layout> {
  const bound = context ? resolveBindings(layout, context, definitions, { url: urlResolver(resolveLink) }) : layout
  const queries = listQueries(bound, context)
  const lists = await Promise.all(queries.map((query) => fetchListItems(api, query)))
  const withItems = attachListItems(bound, new Map(queries.map((query, i) => [query.blockId, lists[i]])))
  return resolveLayoutData(withItems, definitions, createRestFetchDocs(api))
}
