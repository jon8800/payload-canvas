import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { CAROUSEL_CLASS_MAP, CAROUSEL_LABELS } from '../client/carousel'
import { classesOf, labelField, labelsField, labelsHelp } from './shared'

export { CAROUSEL_CLASS_MAP, CAROUSEL_LABELS }

export const CAROUSEL_BLOCK = 'carousel'

const CAROUSEL_CLASS = 'flex flex-col gap-4'

/**
 * The carousel's inner elements that take classes (`block.partClassName`), with the classes a new
 * carousel starts with. The "slides" slot (the track) is a part too.
 */
const CAROUSEL_PARTS = {
  controls: { label: 'Controls row' },
  arrow: { label: 'Arrows', defaultClassName: 'size-11 rounded-full border disabled:opacity-30' },
  dot: {
    label: 'Dots',
    defaultClassName: 'size-6 after:size-2 after:rounded-full after:bg-current after:opacity-30 aria-[current=true]:after:opacity-100',
  },
  pause: { label: 'Pause button', defaultClassName: 'text-sm underline' },
}

const LABEL_NAMES = {
  previousLabel: 'Previous button',
  nextLabel: 'Next button',
  pauseLabel: 'Pause button',
  playLabel: 'Play button',
  dotLabel: 'Each dot',
  slideLabel: 'Each slide',
  carouselRole: 'Name of the kind "carousel"',
  slideRole: 'Name of the kind "slide"',
}

/** Content of an arrow button: an icon or a short text. */
const ARROW_CONTENT = ['icon', 'text', 'image']

export function carouselBlock(): BlockDefinition {
  return defineBlock({
    type: CAROUSEL_BLOCK,
    label: 'Carousel',
    icon: 'carousel',
    category: 'Interactive',
    fields: [
      {
        name: 'mode',
        type: 'select',
        label: 'Movement',
        defaultValue: 'scroll',
        options: [
          { label: 'Swipe and scroll', value: 'scroll' },
          { label: 'Fade, one slide at a time', value: 'fade' },
        ],
      },
      { name: 'arrows', type: 'checkbox', label: 'Arrows', defaultValue: true },
      { name: 'dots', type: 'checkbox', label: 'Dots', defaultValue: false },
      { name: 'loop', type: 'checkbox', label: 'Back to the start after the last slide', defaultValue: false },
      {
        name: 'autoplay',
        type: 'number',
        label: 'Autoplay every (ms)',
        defaultValue: 0,
        min: 0,
        admin: {
          description:
            '0 is off. With autoplay the carousel shows a pause button. It also stops while the pointer is over it, while it has ' +
            'focus, and when the visitor asks for less motion.',
        },
      },
      labelField('label', CAROUSEL_LABELS.label, 'Label for screen readers'),
      labelsField(CAROUSEL_LABELS, LABEL_NAMES),
    ],
    slots: {
      slides: { label: 'Slides', styles: true, defaultClassName: 'gap-4' },
      previous: { label: 'Previous button', allow: ARROW_CONTENT, max: 1 },
      next: { label: 'Next button', allow: ARROW_CONTENT, max: 1 },
    },
    parts: CAROUSEL_PARTS,
    defaultClassName: CAROUSEL_CLASS,
    classes: classesOf(CAROUSEL_CLASS_MAP),
    ai: {
      description:
        'Slides that swipe sideways (mode "scroll") or fade one into the next (mode "fade"), with optional arrows, dots, loop and ' +
        'autoplay. Each direct child of the "slides" slot is one slide; give each slide its width with its own className ' +
        '("w-[85%] md:w-1/3"). A single collectionList or repeat child makes each of its items a slide (set the width on the item); any other single child is one slide. ' +
        'The optional "previous" and "next" slots hold the arrow content (an icon); empty, they show a chevron. Style the inner ' +
        'elements with "partClassName": "slides" for the track (the gap between slides), "arrow" for both arrows, "dot" for each ' +
        'dot (the current dot has aria-current="true"), "controls" for the row of controls, "pause" for the pause button that ' +
        'autoplay adds. It is a <section> region with aria-roledescription "carousel"; each slide gets an "i of n" label. The canvas ' +
        'always scrolls and never autoplays.' +
        labelsHelp(CAROUSEL_LABELS) +
        ' {n} is the slide number and {count} the number of slides. "carouselRole" and "slideRole" are the aria-roledescription values.',
      example: {
        type: CAROUSEL_BLOCK,
        props: { mode: 'scroll', arrows: true, dots: true, label: 'Reviews' },
        className: CAROUSEL_CLASS,
        partClassName: { slides: 'gap-4', arrow: CAROUSEL_PARTS.arrow.defaultClassName, dot: CAROUSEL_PARTS.dot.defaultClassName },
        slots: {
          slides: [
            {
              id: 'b_example_1',
              type: 'stack',
              className: 'flex w-[85%] flex-col gap-2 rounded-lg border p-6 md:w-1/3',
              slots: { children: [{ id: 'b_example_2', type: 'text', props: { text: 'A slide.' } }] },
            },
          ],
        },
      },
    },
  })
}
