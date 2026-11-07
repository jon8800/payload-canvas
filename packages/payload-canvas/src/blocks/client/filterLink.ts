// Read by the filter link component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { PAGE_PARAM } from '../../core/blockNames'

/** A URL query: `URLSearchParams`, or the `searchParams` object of a Next.js page. */
export type FilterQuery = URLSearchParams | Record<string, string | string[] | undefined>

/** The values of one param: repeated params and comma lists both count. */
function valuesOf(query: FilterQuery, param: string): string[] {
  const raw = query instanceof URLSearchParams ? query.getAll(param) : ([] as string[]).concat(query[param] ?? [])
  return raw.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean)
}

const keysOf = (query: FilterQuery) => [...new Set(query instanceof URLSearchParams ? query.keys() : Object.keys(query))]

export type FilterLinkTarget = {
  param: string
  value: string
  multiple?: boolean
  /** Page parameters of lists with their own `pageParam`, dropped like `page`. */
  pageParams?: readonly string[]
}

/**
 * Where a filter link goes and whether it is the current filter. An empty `param` clears every
 * query value ("All"). An empty `value` clears its param. `multiple` toggles the value in the
 * param's comma list; otherwise the value replaces the param's values. Other params stay.
 * `path` is the page path; with an empty path the href is relative (`?a=b`, or `?` for none).
 */
export function filterHref(path: string, query: FilterQuery, { param, value, multiple, pageParams = [] }: FilterLinkTarget): { href: string; active: boolean } {
  // A new filter starts again at page 1, so the page numbers are dropped.
  const pages = new Set([PAGE_PARAM, ...pageParams])
  const params = keysOf(query).filter((key) => !pages.has(key) && valuesOf(query, key).length > 0)
  const link = (search: string) => (search ? `${path}?${search}` : path || '?')
  if (!param) return { href: link(''), active: params.length === 0 }
  const current = valuesOf(query, param)
  const active = value ? current.includes(value) : current.length === 0
  const next = !value ? [] : !multiple ? [value] : active ? current.filter((item) => item !== value) : [...current, value]
  const search = [...params.filter((key) => key !== param), ...(next.length > 0 ? [param] : [])]
    .map((key) => `${encodeURIComponent(key)}=${(key === param ? next : valuesOf(query, key)).map(encodeURIComponent).join(',')}`)
    .join('&')
  return { href: link(search), active }
}
