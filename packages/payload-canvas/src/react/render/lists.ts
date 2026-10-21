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
  /** Documents to skip after the sort (and after leaving out the current document). */
  offset?: number
  /** Depth of related documents, when more than 1. */
  depth?: 2
}

/**
 * The request's URL query, for collection lists' `queryFilters`: `URLSearchParams`, or the
 * `searchParams` object of a Next.js page.
 */
export type ListQueryParams = URLSearchParams | Record<string, string | string[] | undefined>

/** The values of one URL parameter: repeated (`?a=x&a=y`) or comma-separated (`?a=x,y`). */
function paramValues(query: ListQueryParams, param: string): string[] {
  const raw = query instanceof URLSearchParams ? query.getAll(param) : ([] as string[]).concat(query[param] ?? [])
  return raw.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean)
}

/**
 * The `queryFilters` of a list for the URL query: `{ [param]: { [value]: Where } }`. Each present
 * `param=value` adds its `Where`; values of one param are OR-ed, params are AND-ed. Unknown values
 * are ignored.
 */
function queryFiltersOf(filters: unknown, query: ListQueryParams | null | undefined): Where[] {
  if (!query || !isRecord(filters)) return []
  const out: Where[] = []
  for (const [param, byValue] of Object.entries(filters)) {
    if (!isRecord(byValue)) continue
    const matched = paramValues(query, param)
      .map((value) => (Object.hasOwn(byValue, value) ? byValue[value] : undefined))
      .filter((where): where is Where => isRecord(where) && Object.keys(where).length > 0)
    if (matched.length > 0) out.push(matched.length === 1 ? matched[0]! : { or: matched })
  }
  return out
}

const DATE_TOKEN = /^\$now(?:([+-])(\d+)([dh]))?$/
const UNIT_MS = { d: 86_400_000, h: 3_600_000 } as const

/**
 * Date tokens in where values: `$now`, `$now-30d`, `$now+12h` become ISO dates. `now` is rounded
 * down to the minute, so the canvas cache keeps one key per minute.
 */
export function withDateTokens<T>(value: T, now = Date.now()): T {
  const minute = Math.floor(now / 60_000) * 60_000
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const match = DATE_TOKEN.exec(v)
      if (!match) return v
      const [, sign, amount, unit] = match
      const shift = sign ? (sign === '-' ? -1 : 1) * Number(amount) * UNIT_MS[unit as 'd' | 'h'] : 0
      return new Date(minute + shift).toISOString()
    }
    if (Array.isArray(v)) return v.map(visit)
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, visit(inner)]))
    return v
  }
  return visit(value) as T
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
// ponytail: offsets load the skipped documents too; use Payload pages if lists need deep offsets.
const MAX_OFFSET = 100
const DEFAULT_SORT = '-createdAt'

/**
 * The query of every collection list block in the layout (also inside other lists' items).
 * `filterField` needs the current document (`context`); without one the list is unfiltered.
 * `queryFilters` need the URL query (`query`); without one they are off (the canvas).
 */
export function listQueries(layout: Layout, context?: TemplateContext | null, query?: ListQueryParams | null): ListQuery[] {
  const queries: ListQuery[] = []
  walkBlocks(layout, (block) => {
    if (block.type !== COLLECTION_LIST_BLOCK) return
    const props = block.props ?? {}
    const collection = typeof props.collection === 'string' ? props.collection.trim() : ''
    if (!collection) return
    const rawLimit = typeof props.limit === 'number' && Number.isFinite(props.limit) ? Math.round(props.limit) : DEFAULT_LIMIT
    const sort = typeof props.sort === 'string' && props.sort.trim() ? props.sort.trim() : DEFAULT_SORT
    const list: ListQuery = { blockId: block.id, collection, limit: Math.min(Math.max(rawLimit, 1), MAX_LIMIT), sort }
    const id = context?.doc.id
    const exclude = props.excludeCurrent !== false && context?.collection === collection
    if (exclude && (typeof id === 'string' || typeof id === 'number')) list.exclude = id
    const offset = typeof props.offset === 'number' && Number.isFinite(props.offset) ? Math.min(Math.floor(props.offset), MAX_OFFSET) : 0
    if (offset > 0) list.offset = offset
    if (String(props.depth) === '2') list.depth = 2
    const filter = filterOf(props, context)
    if (filter === 'none') list.none = true
    const where = [filter, props.where, ...queryFiltersOf(props.queryFilters, query)].filter(
      (w): w is Where => isRecord(w) && Object.keys(w).length > 0,
    )
    if (!list.none && where.length > 0) list.where = withDateTokens(where.length === 1 ? where[0]! : { and: where })
    queries.push(list)
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
