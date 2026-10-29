import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { labelField } from './shared'

export const TABLE_OF_CONTENTS_BLOCK = 'tableOfContents'

/** The table of contents' label and its English default. */
export const TABLE_OF_CONTENTS_LABELS = { label: 'On this page' }

const TOC_CLASS = 'flex flex-col gap-2 text-sm [&>a]:opacity-75 [&>a:hover]:opacity-100'

export function tableOfContentsBlock(): BlockDefinition {
  return defineBlock({
    type: TABLE_OF_CONTENTS_BLOCK,
    label: 'Table of contents',
    icon: 'tableOfContents',
    category: 'Dynamic',
    fields: [
      {
        name: 'content',
        type: 'richText',
        label: 'Rich text',
        admin: {
          description:
            'Bind it to the rich text field of the document, for example "content". Its H2 headings become the links. ' +
            'The rich text on the page gives its headings the same ids.',
        },
      },
      {
        name: 'minHeadings',
        type: 'number',
        label: 'Fewest headings',
        defaultValue: 3,
        min: 1,
        admin: { description: 'With fewer H2 headings the block shows nothing.' },
      },
      labelField('label', TABLE_OF_CONTENTS_LABELS.label, 'Label for screen readers'),
    ],
    defaultClassName: TOC_CLASS,
    ai: {
      description:
        'Links to the H2 headings of a rich text field of the current document (templates): bind its "content" prop to that ' +
        'field, e.g. bindings { "content": "content" }. It renders a <nav> of bare <a href="#id"> elements: style them with ' +
        '[&>a]: classes. The richText and field blocks give each heading an id from its text, so the links find them. Put a ' +
        'visible title ("On this page") in a block above it. "label" names the nav for screen readers (default "On this ' +
        'page"). Shows nothing with fewer than "minHeadings" headings; the canvas shows sample links then.',
      example: {
        type: TABLE_OF_CONTENTS_BLOCK,
        bindings: { content: 'content' },
        className: TOC_CLASS,
      },
    },
  })
}
