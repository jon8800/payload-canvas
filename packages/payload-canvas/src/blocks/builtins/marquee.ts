import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { MARQUEE_CSS, MARQUEE_SECONDS } from '../client/marquee'

export { MARQUEE_CSS, MARQUEE_SECONDS }

export const MARQUEE_BLOCK = 'marquee'

/** The edges fade out. A mask, not a colour, so it works on any background. */
const MARQUEE_CLASS = '[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]'

/** The items' row. Margins (not a gap) space the items, so the loop has no jump between rounds. */
const ITEMS_CLASS = 'flex items-center *:mx-8'

export function marqueeBlock(): BlockDefinition {
  return defineBlock({
    type: MARQUEE_BLOCK,
    label: 'Marquee',
    description: 'A row of logos or words that scrolls without end.',
    icon: 'marquee',
    category: 'Media',
    fields: [
      {
        name: 'speed',
        type: 'select',
        label: 'Speed',
        defaultValue: 'normal',
        options: [
          { label: 'Slow', value: 'slow' },
          { label: 'Normal', value: 'normal' },
          { label: 'Fast', value: 'fast' },
        ],
      },
      {
        name: 'direction',
        type: 'select',
        label: 'Direction',
        defaultValue: 'left',
        options: [
          { label: 'To the left', value: 'left' },
          { label: 'To the right', value: 'right' },
        ],
      },
      { name: 'pauseOnHover', type: 'checkbox', label: 'Stop under the pointer', defaultValue: true },
    ],
    slots: { children: { label: 'Items', styles: true, defaultClassName: ITEMS_CLASS } },
    defaultClassName: MARQUEE_CLASS,
    ai: {
      description:
        'A row of items (logos, words, short quotes) that scrolls sideways without end, in CSS only. Each direct child of ' +
        'the "children" slot is one item; give images a fixed height ("h-8 w-auto"). A repeat or collection list child is ' +
        'one item: lay out its items with "flex items-center gap-16" (twice the "*:mx-8" margin, so the spacing stays even). ' +
        `"speed": "slow", "normal" or "fast" (${MARQUEE_SECONDS.slow}, ${MARQUEE_SECONDS.normal} or ` +
        `${MARQUEE_SECONDS.fast} seconds per round), "direction": "left" or "right", "pauseOnHover" (default on; it also ` +
        'stops while a link in it has focus). The items show twice on the site (the copy is hidden from screen readers), ' +
        'so the row loops without a gap. Space the items with margins in the "children" part ("*:mx-8"), not a gap, so ' +
        'the loop does not jump. Keep the row wider than the screen: repeat a short list of items. When the visitor asks ' +
        'for less motion, and on the canvas, it stands still and the items wrap. The default className fades the edges ' +
        'with a mask.',
      example: {
        type: MARQUEE_BLOCK,
        props: { speed: 'normal', direction: 'left', pauseOnHover: true },
        className: MARQUEE_CLASS,
        partClassName: { children: ITEMS_CLASS },
        slots: {
          children: [
            { id: 'b_example_1', type: 'image', props: { image: 1, alt: 'Acme' }, className: 'h-8 w-auto' },
            { id: 'b_example_2', type: 'image', props: { image: 2, alt: 'Globex' }, className: 'h-8 w-auto' },
            { id: 'b_example_3', type: 'image', props: { image: 3, alt: 'Initech' }, className: 'h-8 w-auto' },
          ],
        },
      },
    },
  })
}
