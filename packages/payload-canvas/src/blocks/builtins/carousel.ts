import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { CAROUSEL_CLASS_MAP, CAROUSEL_LABELS, CAROUSEL_PART_CLASSES } from '../client/carousel'
import { classesOf, labelField, labelsField, labelsHelp } from './shared'

export { CAROUSEL_CLASS_MAP, CAROUSEL_LABELS, CAROUSEL_PART_CLASSES }

export const CAROUSEL_BLOCK = 'carousel'

const CAROUSEL_CLASS = 'flex flex-col gap-4'

/**
 * The carousel's inner elements that take classes (`block.partClassName`), with the classes a new
 * carousel starts with. The "slides" slot (the track) is a part too.
 */
const CAROUSEL_PARTS = {
  controls: { label: 'Controls row' },
  arrow: { label: 'Arrows', defaultClassName: CAROUSEL_PART_CLASSES.arrow },
  dot: { label: 'Dots', defaultClassName: CAROUSEL_PART_CLASSES.dot },
  pause: { label: 'Pause button', defaultClassName: CAROUSEL_PART_CLASSES.pause },
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
    description: 'Slides that visitors move through with arrows, dots or a swipe.',
    fields: [
      {
        name: 'mode',
        type: 'select',
        label: 'Movement',
        defaultValue: 'scroll',
        options: [
          { label: 'Slide sideways', value: 'scroll' },
          { label: 'Fade, one slide at a time', value: 'fade' },
        ],
      },
      {
        name: 'align',
        type: 'select',
        label: 'Slide position',
        defaultValue: 'start',
        options: [
          { label: 'Start', value: 'start' },
          { label: 'Center', value: 'center' },
        ],
        admin: { description: 'Where the current slide sits when the slides are narrower than the carousel.' },
      },
      { name: 'arrows', type: 'checkbox', label: 'Arrows', defaultValue: true },
      { name: 'dots', type: 'checkbox', label: 'Dots', defaultValue: false },
      { name: 'loop', type: 'checkbox', label: 'Loop: the first slide follows the last', defaultValue: false },
      {
        name: 'autoplay',
        type: 'number',
        label: 'Autoplay every (ms)',
        defaultValue: 0,
        min: 0,
        admin: {
          description:
            '0 is off. With autoplay the carousel shows a pause button. It pauses while the pointer is over it or it has focus, ' +
            'stops when the visitor swipes, and never runs when the visitor asks for less motion. The editor never autoplays.',
        },
      },
      labelField('label', CAROUSEL_LABELS.label, 'Label for screen readers'),
      labelsField(CAROUSEL_LABELS, LABEL_NAMES),
    ],
    slots: {
      slides: { label: 'Slides', styles: true, defaultClassName: CAROUSEL_PART_CLASSES.slides },
      previous: { label: 'Previous button', allow: ARROW_CONTENT, max: 1 },
      next: { label: 'Next button', allow: ARROW_CONTENT, max: 1 },
    },
    parts: CAROUSEL_PARTS,
    defaultClassName: CAROUSEL_CLASS,
    classes: classesOf(CAROUSEL_CLASS_MAP),
    ai: {
      description:
        'Slides that move sideways (mode "scroll": swipe, drag, arrows, dots, arrow keys) or fade one into the next (mode "fade"), ' +
        'with optional arrows, dots, loop and autoplay. Each direct child of the "slides" slot is one slide; set how many show at ' +
        'once with the className of each slide, e.g. "basis-full md:basis-1/2 lg:basis-1/3" (or a width like "w-[85%]"). A ' +
        'single collectionList or repeat child makes each of its items a slide (set the basis on the item); any other single ' +
        'child is one slide. "align" "start" or "center" places the current slide. Dots: one per stop, so fewer dots than slides ' +
        'when several slides show at once. The optional "previous" and "next" slots hold the arrow content (an icon); empty, they ' +
        'show a chevron. Style the inner elements with "partClassName": "slides" for the track (the gap between slides), "arrow" ' +
        'for both arrows, "dot" for each dot (the current dot has aria-current="true"; its mark is its ::after), "controls" for ' +
        'the row of controls, "pause" for the pause button that autoplay adds. It is a <section> region with ' +
        'aria-roledescription "carousel"; each slide gets an "i of n" label. In the editor the controls work, slides do not drag, ' +
        'fade shows as sliding and autoplay is off; selecting a block in a slide moves the carousel to it.' +
        labelsHelp(CAROUSEL_LABELS) +
        ' {n} is the slide number and {count} the number of slides. "carouselRole" and "slideRole" are the aria-roledescription values.',
      example: {
        type: CAROUSEL_BLOCK,
        props: { mode: 'scroll', arrows: true, dots: true, label: 'Reviews' },
        className: CAROUSEL_CLASS,
        partClassName: { slides: CAROUSEL_PART_CLASSES.slides, arrow: CAROUSEL_PART_CLASSES.arrow, dot: CAROUSEL_PART_CLASSES.dot },
        slots: {
          slides: [
            {
              id: 'b_example_1',
              type: 'stack',
              className: 'flex basis-[85%] flex-col gap-2 rounded-lg border p-6 md:basis-1/3',
              slots: { children: [{ id: 'b_example_2', type: 'text', props: { text: 'A slide.' } }] },
            },
          ],
        },
      },
    },
  })
}
