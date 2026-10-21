import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'

export const TABLE_OF_CONTENTS_BLOCK = 'tableOfContents'

const TOC_CLASS = 'flex flex-col gap-2 text-sm [&>a]:opacity-75 [&>a:hover]:opacity-100'

export function tableOfContentsBlock(): BlockDefinition {
  return defineBlock({
    type: TABLE_OF_CONTENTS_BLOCK,
    label: 'Table of contents',
    icon: 'hash',
    category: 'Dynamic',
    fields: [
      {
        name: 'content',
        type: 'richText',
        label: 'Rich text',
        admin: {
          description:
            'Bind it to the rich text field of the document, for example "content". Its H2 headings become the links. ' +
            'The heading ids come from headingId(), the same as the rich text on the page.',
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
      { name: 'label', type: 'text', label: 'Label for screen readers', defaultValue: 'On this page', localized: true },
    ],
    defaultClassName: TOC_CLASS,
    ai: {
      description:
        'Links to the H2 headings of a rich text field of the current document (templates): bind its "content" prop to that ' +
        'field, e.g. bindings { "content": "content" }. It renders a <nav> of bare <a href="#id"> elements: style them with ' +
        '[&>a]: classes. The heading ids come from headingId(text), which the rich text on the page uses too. Put a visible ' +
        'title ("On this page") in a block above it. Shows nothing with fewer than "minHeadings" headings; the canvas shows ' +
        'sample links then.',
      example: {
        type: TABLE_OF_CONTENTS_BLOCK,
        bindings: { content: 'content' },
        className: TOC_CLASS,
      },
    },
  })
}
