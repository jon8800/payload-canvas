// Collection list blocks: which documents each one needs, and attaching the loaded documents.
// Shared by `loadLayoutData` (Local API) and the canvas (REST).

import type { Where } from 'payload'

import {
  COLLECTION_LIST_BLOCK,
  getByPath,
  LIST_ITEMS_PROP,
  walkBlocks,
  type Block,
  type Layout,
  type TemplateContext,
} from '../../core'
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
  /** Payload `where`: the `filterField` filter and the block's static `where`, AND-ed. */
  where?: Where
  /** True when the filter matches no documents (the current document has no values): do not query. */
  none?: true
}

/** How `filterField` relates the listed documents to the current document. */
export type ListFilterBy = 'current' | 'shared' | 'linked'

type Id = string | number

const isId = (value: unknown): value is Id =>
  (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value))

/** The ids or values in a field value: populated documents, `{ relationTo, value }` pairs, primitives, single or many. */
function valuesOf(value: unknown): Id[] {
  const out = new Set<Id>()
  for (const item of Array.isArray(value) ? value : [value]) {
    const inner = isRecord(item) && 'relationTo' in item && 'value' in item ? item.value : item
    const id = isRecord(inner) ? inner.id : inner
    if (isId(id)) out.add(id)
  }
  return [...out]
}

/**
 * The `filterField` filter of a list on the current document's page, or `none` when it matches
 * nothing. Undefined without a filter or without a current document (then the list is unfiltered).
 */
function filterOf(props: Record<string, unknown>, context: TemplateContext | null | undefined): Where | 'none' | undefined {
  const field = typeof props.filterField === 'string' ? props.filterField.trim() : ''
  if (!field || !context) return undefined
  const by: ListFilterBy = props.filterBy === 'shared' || props.filterBy === 'linked' ? props.filterBy : 'current'
  if (by === 'current') return isId(context.doc.id) ? { [field]: { in: [context.doc.id] } } : undefined
  const values = valuesOf(getByPath(context.doc, field))
  if (values.length === 0) return 'none'
  return by === 'shared' ? { [field]: { in: values } } : { id: { in: values } }
}

const DEFAULT_LIMIT = 3
const MAX_LIMIT = 100
const DEFAULT_SORT = '-createdAt'

/**
 * The query of every collection list block in the layout (also inside other lists' items).
 * `filterField` needs the current document (`context`); without one the list is unfiltered.
 */
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
    const filter = filterOf(props, context)
    if (filter === 'none') query.none = true
    const where = [filter, props.where].filter(
      (w): w is Where => isRecord(w) && Object.keys(w).length > 0,
    )
    if (!query.none && where.length > 0) query.where = where.length === 1 ? where[0] : { and: where }
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
