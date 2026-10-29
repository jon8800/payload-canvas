import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { classesOf, classMap, INTERACTIVE } from './shared'

export const DISCLOSURE_BLOCK = 'disclosure'
export const ACCORDION_BLOCK = 'accordion'

/**
 * Classes the disclosure component adds itself. `animate`: the browser animates the content box
 * (`::details-content`) to `height: auto`; off with reduced motion and in browsers without it.
 */
export const DISCLOSURE_CLASS_MAP = classMap({
  summary: 'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
  animate:
    '[interpolate-size:allow-keywords] details-content:h-0 details-content:overflow-clip ' +
    'details-content:transition-[height,content-visibility] details-content:duration-300 ' +
    'details-content:[transition-behavior:allow-discrete] open:details-content:h-auto motion-reduce:details-content:transition-none',
})

const DISCLOSURE_CLASS =
  'group [&>summary]:flex [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-4 [&>summary]:py-4 [&>div]:pb-4'

export function disclosureBlock(): BlockDefinition {
  return defineBlock({
    type: DISCLOSURE_BLOCK,
    label: 'Disclosure',
    description: 'A title that opens and closes the content below it.',
    icon: 'disclosure',
    category: 'Interactive',
    fields: [
      { name: 'open', type: 'checkbox', label: 'Open at first', defaultValue: false },
      { name: 'animate', type: 'checkbox', label: 'Animate', defaultValue: true },
    ],
    slots: {
      // A <summary> is the button: links and controls inside it are invalid HTML.
      summary: { label: 'Summary', disallow: INTERACTIVE, styles: true },
      content: { label: 'Content', styles: true },
    },
    defaultClassName: DISCLOSURE_CLASS,
    classes: classesOf(DISCLOSURE_CLASS_MAP),
    ai: {
      description:
        'One show/hide item: an FAQ question and answer, a "read more". The "summary" slot is always visible (a heading or ' +
        'text, often with an icon); the "content" slot opens below it. A native <details>, so it works without script, opens ' +
        'with the keyboard and closed content stays in the HTML for search engines. In the canvas, selecting a block inside opens it. Style the ' +
        'summary row with [&>summary]: classes and the content with [&>div]: classes on the disclosure; open: and ' +
        'group-open: classes style the open state (e.g. "group-open:rotate-45" on an icon in the summary).',
      example: {
        type: DISCLOSURE_BLOCK,
        className: DISCLOSURE_CLASS,
        slots: {
          summary: [{ id: 'b_example_1', type: 'heading', props: { text: 'How do I reset my password?', level: '3' }, className: 'text-lg font-medium' }],
          content: [{ id: 'b_example_2', type: 'text', props: { text: 'Use the "Forgot password" link on the sign-in page.' } }],
        },
      },
    },
  })
}

export function accordionBlock(): BlockDefinition {
  return defineBlock({
    type: ACCORDION_BLOCK,
    label: 'Accordion',
    description: 'A stack of items that open and close, like an FAQ.',
    icon: 'accordion',
    category: 'Interactive',
    fields: [
      { name: 'multiple', type: 'checkbox', label: 'Several open at a time', defaultValue: true },
      {
        name: 'faqSchema',
        type: 'checkbox',
        label: 'FAQ for search engines',
        defaultValue: false,
        admin: { description: 'Only for real questions and answers.' },
      },
    ],
    slots: { items: { label: 'Items', allow: [DISCLOSURE_BLOCK, 'repeat', 'collectionList'] } },
    defaultClassName: 'flex flex-col divide-y border-y',
    ai: {
      description:
        'A list of disclosure blocks in its "items" slot. "multiple": false keeps one item open at a time. Set "faqSchema": true ' +
        'only when the items are questions and answers: the site then outputs FAQPage JSON-LD for them by itself (nothing else to do): the summary text is the question, the content text the ' +
        'answer. In a template, repeat one disclosure over the document\'s FAQs: the items slot holds a repeat with path ' +
        '"faqs" whose item is a disclosure with a text bound to "question" in "summary" and a text bound to "answer" in "content".',
      example: {
        type: ACCORDION_BLOCK,
        props: { multiple: false, faqSchema: true },
        className: 'flex flex-col divide-y border-y',
        slots: {
          items: [
            {
              id: 'b_example_1',
              type: DISCLOSURE_BLOCK,
              className: DISCLOSURE_CLASS,
              slots: {
                summary: [{ id: 'b_example_2', type: 'text', props: { text: 'Do you ship abroad?' } }],
                content: [{ id: 'b_example_3', type: 'text', props: { text: 'Yes, to most countries.' } }],
              },
            },
          ],
        },
      },
    },
  })
}
