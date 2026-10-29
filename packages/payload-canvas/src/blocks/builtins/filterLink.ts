import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { INTERACTIVE } from './shared'

export { filterHref, type FilterLinkTarget, type FilterQuery } from '../client/filterLink'

export const FILTER_LINK_BLOCK = 'filterLink'

const FILTER_CLASS = 'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm aria-[current=true]:font-semibold'

export function filterLinkBlock(): BlockDefinition {
  return defineBlock({
    type: FILTER_LINK_BLOCK,
    label: 'Filter link',
    icon: 'filter',
    category: 'Dynamic',
    fields: [
      {
        name: 'param',
        type: 'text',
        label: 'URL parameter',
        admin: { description: 'The query parameter this link sets, for example "category". Empty: the link clears every filter ("All").' },
      },
      {
        name: 'value',
        type: 'text',
        label: 'Value',
        admin: { description: 'The value it sets, for example "news" (makes ?category=news). Empty: the link clears this parameter.' },
      },
      {
        name: 'multiple',
        type: 'checkbox',
        label: 'Several values',
        admin: { description: 'The link adds or removes its value in a comma list (?tag=css,react) instead of replacing it.' },
      },
    ],
    slots: { children: { label: 'Content', disallow: INTERACTIVE } },
    defaultClassName: FILTER_CLASS,
    ai: {
      description:
        'A link to the current page with one URL query value set, toggled or cleared, for the "queryFilters" of a collection ' +
        'list (a filterLink with param "category" and value "news" goes to ?category=news). Other query values stay. An ' +
        'empty param clears every filter (the "All" link); an empty value clears its param. "multiple" toggles the value in a ' +
        'comma list. It drops the page numbers of paginated lists ("page", and the "pageParam" of each list in the same ' +
        'layout). The current filter gets aria-current="true": style it with aria-[current=true]: classes. Its "children" ' +
        'slot holds the label (a text, an icon). Filtered URLs should be noindex, follow.',
      example: {
        type: FILTER_LINK_BLOCK,
        props: { param: 'category', value: 'news' },
        className: FILTER_CLASS,
        slots: { children: [{ id: 'b_example_1', type: 'text', props: { text: 'News' } }] },
      },
    },
  })
}
