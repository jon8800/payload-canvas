// Collection list blocks: which documents each one needs, and attaching the loaded documents.
// Shared by `loadLayoutData` (Local API) and the canvas (REST).

import type { Where } from 'payload'

import {
  COLLECTION_LIST_BLOCK,
  getByPath,
  LIST_ITEMS_PROP,
  PAGE_PARAM,
  walkBlocks,
  type Block,
  type Layout,
  type TemplateContext,
} from '../../core'
import { FILTER_LINK_BLOCK } from '../../blocks/builtins/filterLink'
import { DATE_TOKEN, pageTokenPath, queryTokenParam } from '../../core/whereValues'
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
  /** Picked documents (`ids`): only these, in this order. `limit`, `offset`, `sort` and pages do not apply. */
  ids?: Id[]
  /** `sort: "$random"`: a shuffle of the newest 100 matches, then `offset` and `limit`. */
  random?: true
  /** `paginate: "pages"`: the page to show, from 1 (the URL's `?page=`). */
  page?: number
  /** The list's own page parameter (`pageParam`), when it is not `page`. */
  pageParam?: string
}

/** The runtime prop that carries a paginated list's page links (`ListPages`). Never stored. */
export const LIST_PAGES_PROP = '$pages'
export { PAGE_PARAM }
/** `sort` value that shuffles the list. */
export const RANDOM_SORT = '$random'

/**
 * A paginated list's page links, for the collection list component. Long lists show the first,
 * the last and the pages next to the current one; `gapBefore` marks a link after left-out pages.
 */
export type ListPages = { current: number; links: Array<{ page: number; href: string; current: boolean; gapBefore?: true }> }

/** The runtime prop of filter links that holds the page parameters of the layout's lists (`withPageParams`). */
export const LIST_PAGE_PARAMS_PROP = '$pageParams'

/** A page parameter name: letters, digits, `_` and `-`. */
const PARAM_NAME = /^[\w-]+$/

/** A list's page parameter: its `pageParam` prop when that is a valid name, else `page`. */
export function pageParamOf(props: Record<string, unknown> | undefined): string {
  const raw = typeof props?.pageParam === 'string' ? props.pageParam.trim() : ''
  return PARAM_NAME.test(raw) ? raw : PAGE_PARAM
}

/**
 * The pages a pager shows, in order: the first, the last, the current one and one on each side.
 * A gap of a single page shows that page instead. Seven pages or fewer: all of them.
 */
export function pageWindow(current: number, totalPages: number): number[] {
  const shown = new Set([1, totalPages, current - 1, current, current + 1])
  const pages: number[] = []
  for (let page = 1; page <= totalPages; page++) {
    // A gap of one page shows that page: "…" would take the same room.
    if (totalPages <= 7 || shown.has(page) || (shown.has(page - 1) && shown.has(page + 1))) pages.push(page)
  }
  return pages
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
 * The `queryFilters` of a list for the URL query. Each param has one of two forms:
 * - a field path (`{ category: "category" }`): the field equals the URL value (`?category=news`);
 * - values to `Where` queries (`{ sort: { recent: Where, popular: Where } }`): each present
 *   `param=value` adds its `Where`; unknown values are ignored.
 * Values of one param are OR-ed, params are AND-ed.
 */
export function queryFiltersOf(filters: unknown, query: ListQueryParams | null | undefined): Where[] {
  if (!query || !isRecord(filters)) return []
  const out: Where[] = []
  for (const [param, byValue] of Object.entries(filters)) {
    const values = paramValues(query, param)
    if (values.length === 0) continue
    if (typeof byValue === 'string') {
      const field = byValue.trim()
      if (field) out.push({ [field]: values.length === 1 ? { equals: values[0] } : { in: values } })
      continue
    }
    if (!isRecord(byValue)) continue
    const matched = values
      .map((value) => (Object.hasOwn(byValue, value) ? byValue[value] : undefined))
      .filter((where): where is Where => isRecord(where) && Object.keys(where).length > 0)
    if (matched.length > 0) out.push(matched.length === 1 ? matched[0]! : { or: matched })
  }
  return out
}

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

/** What the `$page.` and `$query.` values of a where read. */
type WhereTokenSources = { context?: TemplateContext | null; query?: ListQueryParams | null }

/** The plain values of a page field: list items, document ids and plain values. No empty values. */
function tokenValues(value: unknown): Array<string | number | boolean> {
  if (Array.isArray(value)) return value.flatMap(tokenValues)
  if (isRecord(value) && 'relationTo' in value && 'value' in value) return tokenValues(value.value)
  if (isRecord(value)) return isId(value.id) ? [value.id] : []
  if (typeof value === 'boolean' || isId(value)) return [value]
  return []
}

/**
 * One operator of a condition with its `$page.` or `$query.` value read. Several values turn
 * `equals` into `in` and `not_equals` into `not_in`. No value: a URL value drops the condition
 * (as URL filters do); a page field matches nothing, except `not_equals` and `not_in`, which drop.
 */
function readToken(operator: string, value: unknown, sources: WhereTokenSources): { operator: string; value: unknown } | 'drop' | 'none' {
  const path = pageTokenPath(value)
  const param = queryTokenParam(value)
  if (path === null && param === null) return { operator, value }
  let values: Array<string | number | boolean>
  if (path !== null) {
    const context = sources.context
    values = context && path ? tokenValues(getByPath(context.page ?? context.doc, path)) : []
    if (values.length === 0) return operator === 'not_equals' || operator === 'not_in' ? 'drop' : 'none'
  } else {
    values = sources.query && param ? paramValues(sources.query, param) : []
    if (values.length === 0) return 'drop'
  }
  if (operator === 'in' || operator === 'not_in') return { operator, value: values }
  if (values.length > 1 && operator === 'equals') return { operator: 'in', value: values }
  if (values.length > 1 && operator === 'not_equals') return { operator: 'not_in', value: values }
  return { operator, value: values[0] }
}

/**
 * A where with its `$page.<path>` and `$query.<param>` values read (`core/whereValues.ts`).
 * `none`: it matches nothing. `undefined`: nothing is left to filter by. In an `or`, a part with
 * nothing left does not apply and is left out. Other values and keys stay as they are.
 */
export function resolveWhereTokens(where: Where, sources: WhereTokenSources): Where | 'none' | undefined {
  const out: Record<string, unknown> = {}
  const extra: Where[] = []
  for (const [key, inner] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(inner)) {
      const parts = inner.map((part: unknown) => (isRecord(part) ? resolveWhereTokens(part as Where, sources) : part))
      if (key === 'and') {
        if (parts.includes('none')) return 'none'
        const kept = parts.filter((part) => part !== undefined)
        if (kept.length > 0) out.and = kept
        continue
      }
      const kept = parts.filter((part) => part !== undefined && part !== 'none')
      if (kept.length > 0) out.or = kept
      else if (parts.includes('none')) return 'none'
      continue
    }
    if (!isRecord(inner)) {
      out[key] = inner
      continue
    }
    const condition: Record<string, unknown> = {}
    for (const [operator, value] of Object.entries(inner)) {
      const read = readToken(operator, value, sources)
      if (read === 'none') return 'none'
      if (read === 'drop') continue
      // `equals` became `in`, and the condition has an `in` already: AND the two.
      if (read.operator in condition) extra.push({ [key]: { [read.operator]: read.value } })
      else condition[read.operator] = read.value
    }
    if (Object.keys(condition).length > 0) out[key] = condition
  }
  if (extra.length > 0) out.and = [...(Array.isArray(out.and) ? out.and : []), ...extra]
  return Object.keys(out).length > 0 ? (out as Where) : undefined
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
 * nothing: without a current document (a normal page, or a template without a sample document on
 * the canvas) or when the current document has no values. Undefined without a filter.
 */
function filterOf(props: Record<string, unknown>, context: TemplateContext | null | undefined): Where | 'none' | undefined {
  const field = typeof props.filterField === 'string' ? props.filterField.trim() : ''
  if (!field) return undefined
  if (!context) return 'none'
  const by: ListFilterBy = props.filterBy === 'shared' || props.filterBy === 'linked' ? props.filterBy : 'current'
  if (by === 'current') return isId(context.doc.id) ? { [field]: { in: [context.doc.id] } } : 'none'
  const values = valuesOf(getByPath(context.doc, field))
  if (values.length === 0) return 'none'
  return by === 'shared' ? { [field]: { in: values } } : { id: { in: values } }
}

/** The ids picked in `ids`: plain ids, populated documents or `{ relationTo, value }` pairs of this collection. */
function pickedIds(value: unknown, collection: string): Id[] {
  if (!Array.isArray(value)) return []
  const out = new Set<Id>()
  for (const item of value) {
    if (isRecord(item) && 'relationTo' in item && 'value' in item && item.relationTo !== collection) continue
    for (const id of valuesOf(item)) out.add(id)
  }
  return [...out]
}

/** The page of the URL query (`?page=3`, or the list's own `param`), from 1. */
export function pageOf(query?: ListQueryParams | null, param = PAGE_PARAM): number {
  const raw = query ? paramValues(query, param)[0] : undefined
  const page = raw ? Number(raw) : 1
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/**
 * The page links of a paginated list: `path?page=N` (or the list's own `param`) with the rest of
 * the URL query kept (filters and other lists' pages), and no page param for page 1: page 1 of
 * `/guides` is `/guides`. Without a `path` the links are relative (`?page=2`), and page 1 with no
 * other values is `?`. Long lists get gaps (`pageWindow`). Empty with one page or fewer.
 */
export function pageLinks(query: ListQueryParams | null | undefined, current: number, totalPages: number, param = PAGE_PARAM, path = ''): ListPages {
  const links: ListPages['links'] = []
  if (totalPages <= 1) return { current, links }
  const base = new URLSearchParams()
  if (query instanceof URLSearchParams) for (const [key, value] of query) base.append(key, value)
  else if (query) for (const [key, value] of Object.entries(query)) for (const one of ([] as string[]).concat(value ?? [])) base.append(key, one)
  base.delete(param)
  let previous = 0
  for (const page of pageWindow(current, totalPages)) {
    const params = new URLSearchParams(base)
    if (page > 1) params.set(param, String(page))
    const text = params.toString()
    links.push({ page, href: text ? `${path}?${text}` : path || '?', current: page === current, ...(page > previous + 1 ? { gapBefore: true as const } : {}) })
    previous = page
  }
  return { current, links }
}

/** What to ask Payload for: the number of documents, the sort and the page. */
export function listRequest(query: ListQuery): { limit: number; sort: string; page?: number } {
  if (query.ids) return { limit: Math.max(query.ids.length, 1), sort: DEFAULT_SORT }
  if (query.random) return { limit: MAX_LIMIT, sort: DEFAULT_SORT }
  if (query.page) return { limit: query.limit, sort: query.sort, page: query.page }
  return { limit: query.limit + (query.offset ?? 0), sort: query.sort }
}

/** A small seeded random number generator (mulberry32): the same seed gives the same order. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function hashText(text: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16_777_619)
  return h >>> 0
}

/**
 * The loaded documents in the list's order: picked ids in pick order, a seeded shuffle for
 * `$random` (the seed and the block id pick the order), else after `offset`, at most `limit`.
 */
export function arrangeListDocs(docs: Doc[], query: ListQuery, seed = 0): Doc[] {
  if (query.ids) {
    const byId = new Map(docs.map((doc) => [String(doc.id), doc]))
    return query.ids.map((id) => byId.get(String(id))).filter((doc): doc is Doc => doc !== undefined)
  }
  if (query.page) return docs.slice(0, query.limit)
  const offset = query.offset ?? 0
  if (!query.random) return docs.slice(offset, offset + query.limit)
  const random = seededRandom(seed ^ hashText(query.blockId))
  const shuffled = docs.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled.slice(offset, offset + query.limit)
}

const DEFAULT_LIMIT = 3
const MAX_LIMIT = 100
// ponytail: offsets load the skipped documents too; use Payload pages if lists need deep offsets.
const MAX_OFFSET = 100
const DEFAULT_SORT = '-createdAt'

export type ListQueriesOptions = {
  /**
   * Also query lists in hidden blocks (hidden by hand or by visibility conditions). The canvas
   * does: it shows hidden blocks dimmed. The site does not, so hidden lists cost no query.
   */
  includeHidden?: boolean
}

/**
 * The query of every collection list block in the layout (also inside other lists' items), except
 * in hidden blocks (see `includeHidden`). `filterField` needs the current document (`context`);
 * without one the list shows nothing. `queryFilters` need the URL query (`query`); without one
 * they are off (the canvas). In `where`, `$page.<path>` values read `context` and `$query.<param>`
 * values read `query` (`resolveWhereTokens`), then date tokens become dates.
 */
export function listQueries(
  layout: Layout,
  context?: TemplateContext | null,
  query?: ListQueryParams | null,
  options: ListQueriesOptions = {},
): ListQuery[] {
  const queries: ListQuery[] = []
  walkBlocks(layout, (block) => {
    if (block.hidden && !options.includeHidden) return false
    if (block.type !== COLLECTION_LIST_BLOCK) return
    const props = block.props ?? {}
    const collection = typeof props.collection === 'string' ? props.collection.trim() : ''
    if (!collection) return
    const rawLimit = typeof props.limit === 'number' && Number.isFinite(props.limit) ? Math.round(props.limit) : DEFAULT_LIMIT
    const sort = typeof props.sort === 'string' && props.sort.trim() ? props.sort.trim() : DEFAULT_SORT
    const list: ListQuery = { blockId: block.id, collection, limit: Math.min(Math.max(rawLimit, 1), MAX_LIMIT), sort }
    const ids = pickedIds(props.ids, collection).slice(0, MAX_LIMIT)
    if (ids.length > 0) list.ids = ids
    else if (sort === RANDOM_SORT) list.random = true
    else if (props.paginate === 'pages') {
      const param = pageParamOf(props)
      list.page = pageOf(query, param)
      if (param !== PAGE_PARAM) list.pageParam = param
    }
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
    const resolved = !list.none && where.length > 0 ? resolveWhereTokens(where.length === 1 ? where[0]! : { and: where }, { context, query }) : undefined
    if (resolved === 'none') list.none = true
    else if (resolved) list.where = withDateTokens(resolved)
    queries.push(list)
  })
  return queries
}

/**
 * Puts the loaded documents on each list block as the runtime-only `$items` prop, and a paginated
 * list's page links as `$pages` (`pages`). Never mutates.
 */
export function attachListItems(layout: Layout, items: ReadonlyMap<string, Doc[]>, pages?: ReadonlyMap<string, ListPages>): Layout {
  if (items.size === 0) return layout
  const visit = (blocks: Block[]): Block[] =>
    blocks.map((block) => {
      const docs = items.get(block.id)
      const links = pages?.get(block.id)
      const next: Block = docs
        ? { ...block, props: { ...block.props, [LIST_ITEMS_PROP]: docs, ...(links?.links.length ? { [LIST_PAGES_PROP]: links } : {}) } }
        : block
      if (!next.slots) return next
      return {
        ...next,
        slots: Object.fromEntries(Object.entries(next.slots).map(([name, children]) => [name, visit(children)])),
      }
    })
  return { ...layout, blocks: visit(layout.blocks) }
}

/**
 * Gives every filter link the page parameters of the layout's paginated lists that do not use
 * `page` (`$pageParams`), so a new filter starts those lists at page 1 too. `page` is always
 * dropped. Returns the same layout when no list has its own parameter.
 *
 * It names the built-in filter link on purpose: the block contract has no hook for "data a block
 * needs from the whole layout", and one built-in user does not justify adding one. A custom block
 * that needs the parameters can read `listQueries(layout)` itself.
 */
export function withPageParams(layout: Layout, queries: readonly ListQuery[]): Layout {
  const params = [...new Set(queries.flatMap((query) => (query.pageParam ? [query.pageParam] : [])))]
  if (params.length === 0) return layout
  const visit = (blocks: Block[]): Block[] =>
    blocks.map((block) => {
      const next: Block = block.type === FILTER_LINK_BLOCK ? { ...block, props: { ...block.props, [LIST_PAGE_PARAMS_PROP]: params } } : block
      if (!next.slots) return next
      return { ...next, slots: Object.fromEntries(Object.entries(next.slots).map(([name, children]) => [name, visit(children)])) }
    })
  return { ...layout, blocks: visit(layout.blocks) }
}

/** One collection list of a loaded layout (`loadedLists`). */
export type LoadedList = { blockId: string; collection: string; docs: Doc[] }

/**
 * The collection lists of a layout after `loadLayoutData`, with the documents each one shows, in
 * order: for ItemList JSON-LD without a second query. Hidden blocks (and lists inside them) are
 * left out. A list inside another list's item counts once.
 */
export function loadedLists(layout: Layout): LoadedList[] {
  const out: LoadedList[] = []
  const seen = new Set<string>()
  walkBlocks(layout, (block) => {
    if (block.hidden) return false
    if (block.type !== COLLECTION_LIST_BLOCK || seen.has(block.id) || !Array.isArray(block.props?.[LIST_ITEMS_PROP])) return
    seen.add(block.id)
    const collection = typeof block.props?.collection === 'string' ? block.props.collection.trim() : ''
    out.push({ blockId: block.id, collection, docs: listItemsOf(block.props) })
  })
  return out
}

/** The documents a list block carries (`$items`), or an empty list. */
export function listItemsOf(props: Record<string, unknown> | undefined): Doc[] {
  const value = props?.[LIST_ITEMS_PROP]
  return Array.isArray(value) ? value.filter(isRecord) : []
}
