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
    description: 'Links to the headings of the page text.',
    icon: 'tableOfContents',
    category: 'Dynamic',
    fields: [
      {
        name: 'content',
        type: 'richText',
        label: 'Text with headings',
        admin: { description: 'Bind it to the page’s text field.', custom: { builderContent: false } },
      },
      { name: 'minHeadings', type: 'number', label: 'Hide below this many headings', defaultValue: 3, min: 1 },
      labelField('label', TABLE_OF_CONTENTS_LABELS.label, 'Name for screen readers'),
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
