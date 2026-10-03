// Collection list blocks: which documents each one needs, and attaching the loaded documents.
// Shared by `loadLayoutData` (Local API) and the canvas (REST).

import {
  COLLECTION_LIST_BLOCK,
  LIST_ITEMS_PROP,
  walkBlocks,
  type Block,
  type Layout,
  type TemplateContext,
} from '@payload-toolkit/builder/core'
import { isRecord } from './fields'

export type Doc = Record<string, unknown>

/** What one collection list block shows. */
export type ListQuery = {
  blockId: string
  collection: string
  limit: number
  /** Payload sort, e.g. "-createdAt". */
  sort: string
  /** The id of the page's own document, left out of the list. */
  exclude?: string | number
}

const DEFAULT_LIMIT = 3
const MAX_LIMIT = 100
const DEFAULT_SORT = '-createdAt'

/** The query of every collection list block in the layout (also inside other lists' items). */
export function listQueries(layout: Layout, context?: TemplateContext | null): ListQuery[] {
  const queries: ListQuery[] = []
  walkBlocks(layout, (block) => {
    if (block.type !== COLLECTION_LIST_BLOCK) return
    const props = block.props ?? {}
    const collection = typeof props.collection === 'string' ? props.collection.trim() : ''
    if (!collection) return
    const rawLimit = typeof props.limit === 'number' && Number.isFinite(props.limit) ? Math.round(props.limit) : DEFAULT_LIMIT
    const sort = typeof props.sort === 'string' && props.sort.trim() ? props.sort.trim() : DEFAULT_SORT
    const query: ListQuery = { blockId: block.id, collection, limit: Math.min(Math.max(rawLimit, 1), MAX_LIMIT), sort }
    const id = context?.doc.id
    const exclude = props.excludeCurrent !== false && context?.collection === collection
    if (exclude && (typeof id === 'string' || typeof id === 'number')) query.exclude = id
    queries.push(query)
  })
  return queries
}

/** Puts the loaded documents on each list block as the runtime-only `$items` prop. Never mutates. */
export function attachListItems(layout: Layout, items: ReadonlyMap<string, Doc[]>): Layout {
  if (items.size === 0) return layout
  const visit = (blocks: Block[]): Block[] =>
    blocks.map((block) => {
      const docs = items.get(block.id)
      const next: Block = docs ? { ...block, props: { ...block.props, [LIST_ITEMS_PROP]: docs } } : block
      if (!next.slots) return next
      return {
        ...next,
        slots: Object.fromEntries(Object.entries(next.slots).map(([name, children]) => [name, visit(children)])),
      }
    })
  return { ...layout, blocks: visit(layout.blocks) }
}

/** The documents a list block carries (`$items`), or an empty list. */
export function listItemsOf(props: Record<string, unknown> | undefined): Doc[] {
  const value = props?.[LIST_ITEMS_PROP]
  return Array.isArray(value) ? value.filter(isRecord) : []
}
