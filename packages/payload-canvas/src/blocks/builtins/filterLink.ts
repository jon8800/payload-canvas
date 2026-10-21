import { PAGE_PARAM } from '../../core/bindings'
import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { INTERACTIVE } from './shared'

export const FILTER_LINK_BLOCK = 'filterLink'

/** A URL query: `URLSearchParams`, or the `searchParams` object of a Next.js page. */
export type FilterQuery = URLSearchParams | Record<string, string | string[] | undefined>

/** The values of one param: repeated params and comma lists both count. */
function valuesOf(query: FilterQuery, param: string): string[] {
  const raw = query instanceof URLSearchParams ? query.getAll(param) : ([] as string[]).concat(query[param] ?? [])
  return raw.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean)
}

const keysOf = (query: FilterQuery) => [...new Set(query instanceof URLSearchParams ? query.keys() : Object.keys(query))]

export type FilterLinkTarget = { param: string; value: string; multiple?: boolean }

/**
 * Where a filter link goes and whether it is the current filter. An empty `param` clears every
 * query value ("All"). An empty `value` clears its param. `multiple` toggles the value in the
 * param's comma list; otherwise the value replaces the param's values. Other params stay.
 * `path` is the page path; with an empty path the href is relative (`?a=b`, or `?` for none).
 */
export function filterHref(path: string, query: FilterQuery, { param, value, multiple }: FilterLinkTarget): { href: string; active: boolean } {
  // A new filter starts again at page 1, so the page number is dropped.
  const params = keysOf(query).filter((key) => key !== PAGE_PARAM && valuesOf(query, key).length > 0)
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

const FILTER_CLASS = 'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm aria-[current=true]:font-semibold'

export function filterLinkBlock(): BlockDefinition {
  return defineBlock({
    type: FILTER_LINK_BLOCK,
    label: 'Filter link',
    icon: 'link',
    category: 'Dynamic',
    fields: [
      {
        name: 'param',
        type: 'text',
        label: 'URL parameter',
        admin: { description: 'The query parameter this link sets, for example "available". Empty: the link clears every filter ("All").' },
      },
      {
        name: 'value',
        type: 'text',
        label: 'Value',
        admin: { description: 'The value it sets, for example "today" (makes ?available=today). Empty: the link clears this parameter.' },
      },
      {
        name: 'multiple',
        type: 'checkbox',
        label: 'Several values',
        admin: { description: 'The link adds or removes its value in a comma list (?hair=blonde,red) instead of replacing it.' },
      },
    ],
    slots: { children: { label: 'Content', disallow: INTERACTIVE } },
    defaultClassName: FILTER_CLASS,
    ai: {
      description:
        'A link to the current page with one URL query value set, toggled or cleared, for the "queryFilters" of a collection ' +
        'list (a filterLink with param "available" and value "today" goes to ?available=today). Other query values stay. An ' +
        'empty param clears every filter (the "All" link); an empty value clears its param. "multiple" toggles the value in a ' +
        'comma list. The current filter gets aria-current="true": style it with aria-[current=true]: classes. Its "children" ' +
        'slot holds the label (a text, an icon). Filtered URLs should be noindex, follow.',
      example: {
        type: FILTER_LINK_BLOCK,
        props: { param: 'available', value: 'today' },
        className: FILTER_CLASS,
        slots: { children: [{ id: 'b_example_1', type: 'text', props: { text: 'Available today' } }] },
      },
    },
  })
}
