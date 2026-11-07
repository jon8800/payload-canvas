import { COLLECTION_LIST_BLOCK } from '../../core/blockNames'
import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { ADJACENT_LINKS_LABELS } from '../client/adjacentLinks'
import { labelField, labelsHelp } from './shared'

export { ADJACENT_LINKS_LABELS }

export const ADJACENT_LINKS_BLOCK = 'adjacentLinks'

const ADJACENT_CLASS = 'flex flex-wrap justify-between gap-6'

/** A side: one collection list that finds the document before or after this one. */
const side = (label: string, defaultClassName?: string) => ({
  label,
  allow: [COLLECTION_LIST_BLOCK],
  max: 1,
  styles: true,
  ...(defaultClassName ? { defaultClassName } : {}),
})

/** The collection list of one side: the newest document before this one, or the oldest after it. */
function sideList(which: 'previous' | 'next', at: number, field = 'publishedAt') {
  const before = which === 'previous'
  return {
    id: `b_example_${at}`,
    type: COLLECTION_LIST_BLOCK,
    props: {
      collection: 'posts',
      limit: 1,
      sort: before ? `-${field}` : field,
      where: { [field]: { [before ? 'less_than' : 'greater_than']: `$page.${field}` } },
    },
    className: 'flex',
    slots: {
      item: [
        {
          id: `b_example_${at + 1}`,
          type: 'link',
          className: `flex flex-col gap-1${before ? '' : ' text-end'}`,
          bindings: { link: '$url' },
          slots: {
            children: [
              { id: `b_example_${at + 2}`, type: 'text', props: { text: before ? '← Previous' : 'Next →' }, className: 'text-sm opacity-70' },
              { id: `b_example_${at + 3}`, type: 'heading', props: { level: '3' }, bindings: { text: 'title' }, className: 'text-lg font-semibold' },
            ],
          },
        },
      ],
    },
  }
}

export function adjacentLinksBlock(): BlockDefinition {
  return defineBlock({
    type: ADJACENT_LINKS_BLOCK,
    label: 'Previous / next',
    description: 'Links to the previous and the next post, at the end of a template.',
    icon: 'adjacentLinks',
    category: 'Dynamic',
    fields: [labelField('label', ADJACENT_LINKS_LABELS.label, 'Name for screen readers')],
    slots: { previous: side('Previous'), next: side('Next', 'ms-auto') },
    defaultClassName: ADJACENT_CLASS,
    ai: {
      description:
        'A <nav> with a link to the previous and the next document of the same collection, for the end of a template ' +
        '(blog posts, case studies). Each of its two slots, "previous" and "next", holds ONE collection list that finds ' +
        'that document with the page\'s own value: "previous" sorts by "-publishedAt" with where ' +
        '{ "publishedAt": { "less_than": "$page.publishedAt" } }, "next" sorts by "publishedAt" with where ' +
        '{ "publishedAt": { "greater_than": "$page.publishedAt" } }; both with "limit": 1 and the collection of the ' +
        'template. Use "createdAt" (or any date or number field) the same way. The list\'s "item" slot is the link: a ' +
        'link bound to "$url" around a text ("← Previous") and a heading bound to "title". On the site a side with no ' +
        'document renders nothing, and with no document on either side the whole block renders nothing. Style the sides ' +
        'with "partClassName": "previous" and "next".' +
        labelsHelp(ADJACENT_LINKS_LABELS),
      example: {
        type: ADJACENT_LINKS_BLOCK,
        className: ADJACENT_CLASS,
        partClassName: { next: 'ms-auto' },
        slots: { previous: [sideList('previous', 1)], next: [sideList('next', 5)] },
      },
    },
  })
}
