import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { classesOf, classMap, labelsField, labelsHelp } from './shared'

export const CAROUSEL_BLOCK = 'carousel'

/**
 * Classes the carousel component adds itself: how the track moves its slides and where the
 * controls sit. A single child of the track (a collection list or a repeat) is unwrapped with
 * `display: contents`, so its items are the slides. No colours or sizes: those come from the
 * block's className (see `CAROUSEL_CLASS`).
 */
export const CAROUSEL_CLASS_MAP = classMap({
  scroll:
    'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] *:shrink-0 *:snap-start ' +
    '[&>*:only-child]:contents [&>*:only-child>*]:shrink-0 [&>*:only-child>*]:snap-start',
  fade:
    'grid *:col-start-1 *:row-start-1 *:transition-opacity *:duration-500 motion-reduce:*:transition-none ' +
    '[&>*:only-child]:contents [&>*:only-child>*]:col-start-1 [&>*:only-child>*]:row-start-1 ' +
    '[&>*:only-child>*]:transition-opacity [&>*:only-child>*]:duration-500 motion-reduce:[&>*:only-child>*]:transition-none',
  /** Until the script has counted the slides, only the first one shows. */
  fadeBefore: '[&>*:not(:first-child)]:opacity-0 [&>*:only-child>*:not(:first-child)]:opacity-0',
  fadeReady: '[&_[data-slide-off]]:pointer-events-none [&_[data-slide-off]]:opacity-0',
  controls: 'flex flex-wrap items-center justify-between gap-4',
  dots: 'flex flex-wrap items-center',
  arrows: 'ms-auto flex items-center gap-2',
  button: 'inline-flex cursor-pointer items-center justify-center disabled:cursor-default',
  icon: 'size-5',
})

const CAROUSEL_CLASS =
  'flex flex-col gap-4 [&_[data-carousel-track]]:gap-4 [&_[data-carousel-arrow]]:size-11 [&_[data-carousel-arrow]]:rounded-full ' +
  '[&_[data-carousel-arrow]]:border [&_[data-carousel-arrow]:disabled]:opacity-30 [&_[data-carousel-dot]]:size-6 ' +
  '[&_[data-carousel-dot]]:after:size-2 [&_[data-carousel-dot]]:after:rounded-full [&_[data-carousel-dot]]:after:bg-current ' +
  '[&_[data-carousel-dot]]:after:opacity-30 [&_[data-carousel-dot][aria-current=true]]:after:opacity-100 ' +
  '[&_[data-carousel-pause]]:text-sm [&_[data-carousel-pause]]:underline'

/** The carousel's control labels and their English defaults. */
export const CAROUSEL_LABELS = {
  previousLabel: 'Previous slide',
  nextLabel: 'Next slide',
  pauseLabel: 'Pause',
  playLabel: 'Play',
  dotLabel: 'Slide {n}',
  slideLabel: '{n} of {count}',
  carouselRole: 'carousel',
  slideRole: 'slide',
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
    icon: 'right',
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
      { name: 'label', type: 'text', label: 'Label for screen readers', defaultValue: 'Carousel', localized: true },
      labelsField(CAROUSEL_LABELS, LABEL_NAMES),
    ],
    slots: {
      slides: { label: 'Slides', styles: true },
      previous: { label: 'Previous button', allow: ARROW_CONTENT, max: 1 },
      next: { label: 'Next button', allow: ARROW_CONTENT, max: 1 },
    },
    defaultClassName: CAROUSEL_CLASS,
    classes: classesOf(CAROUSEL_CLASS_MAP),
    ai: {
      description:
        'Slides that swipe sideways (mode "scroll") or fade one into the next (mode "fade"), with optional arrows, dots, loop and ' +
        'autoplay. Each direct child of the "slides" slot is one slide; give each slide its width with its own className ' +
        '("w-[85%] md:w-1/3"). A single collectionList or repeat child makes each of its items a slide (set the width on the item). ' +
        'The optional "previous" and "next" slots hold the arrow content (an icon); empty, they show a chevron. Style from the ' +
        'carousel className: [&_[data-carousel-track]]: for the track (the gap between slides), [&_[data-carousel-arrow]]: for ' +
        'the arrows, [&_[data-carousel-dot]]: for the dots (the current dot has aria-current="true"), [&_[data-carousel-controls]]: ' +
        'for the row of controls, [&_[data-carousel-pause]]: for the pause button that autoplay adds. It is a <section> region with aria-roledescription "carousel"; each slide gets an "i of n" label. The canvas ' +
        'always scrolls and never autoplays.' +
        labelsHelp(CAROUSEL_LABELS) +
        ' {n} is the slide number and {count} the number of slides. "carouselRole" and "slideRole" are the aria-roledescription values.',
      example: {
        type: CAROUSEL_BLOCK,
        props: { mode: 'scroll', arrows: true, dots: true, label: 'Reviews' },
        className: CAROUSEL_CLASS,
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
