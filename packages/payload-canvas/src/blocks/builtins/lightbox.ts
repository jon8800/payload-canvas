import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { classesOf, classMap } from './shared'

export const LIGHTBOX_BLOCK = 'lightbox'

/**
 * Classes the lightbox component adds itself: the position and size of the dialog and its
 * controls. No colours: those come from the block's className (see `LIGHTBOX_CLASS`).
 */
export const LIGHTBOX_CLASS_MAP = classMap({
  root: '[&_img:not([data-lightbox-photo])]:cursor-zoom-in',
  dialog: 'fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0',
  figure: 'm-0 box-border flex size-full items-center justify-center p-4 md:p-16',
  photo: 'max-h-full max-w-full object-contain',
  caption: 'absolute inset-x-0 bottom-4 px-16 text-center',
  hidden: 'sr-only',
  button: 'absolute inline-flex cursor-pointer items-center justify-center',
  close: 'top-4 right-4',
  previous: 'top-1/2 left-4 -translate-y-1/2',
  next: 'top-1/2 right-4 -translate-y-1/2',
  icon: 'size-5',
})

const LIGHTBOX_CLASS =
  'grid grid-cols-2 gap-3 md:grid-cols-3 [&_dialog]:text-white [&_dialog]:backdrop:bg-black/85 ' +
  '[&_[data-lightbox-button]]:size-11 [&_[data-lightbox-button]]:rounded-full [&_[data-lightbox-button]]:bg-black/50'

export function lightboxBlock(): BlockDefinition {
  return defineBlock({
    type: LIGHTBOX_BLOCK,
    label: 'Lightbox',
    icon: 'image',
    category: 'Media',
    fields: [
      { name: 'label', type: 'text', label: 'Label for screen readers', defaultValue: 'Photos', localized: true },
      {
        name: 'group',
        type: 'text',
        label: 'Group',
        admin: { description: 'Lightboxes with the same group on a page open as one set. Optional.' },
      },
      { name: 'captions', type: 'checkbox', label: 'Show the alt text as a caption', defaultValue: false },
    ],
    slots: { children: { label: 'Content' } },
    defaultClassName: LIGHTBOX_CLASS,
    classes: classesOf(LIGHTBOX_CLASS_MAP),
    ai: {
      description:
        'A container whose images open full screen in a modal dialog: a click, or Enter on a focused image. Arrow keys and the ' +
        'arrow buttons step through the images; Escape closes. Lightboxes with the same "group" open as one set. Lay out the ' +
        'images with its className (a grid), or put a repeat of images in it (path "galleryImages", image bound to "$item"). ' +
        'Style the dialog from the className: [&_dialog]: for its text colour and backdrop ([&_dialog]:backdrop:bg-black/85), ' +
        '[&_[data-lightbox-button]]: for the close, previous and next buttons, [&_[data-lightbox-photo]]: for the large photo. ' +
        'The canvas does not open it.',
      example: {
        type: LIGHTBOX_BLOCK,
        props: { label: 'Gallery' },
        className: LIGHTBOX_CLASS,
        slots: {
          children: [
            { id: 'b_example_1', type: 'image', props: { image: 1, alt: 'The lounge' }, className: 'aspect-square w-full object-cover' },
            { id: 'b_example_2', type: 'image', props: { image: 2, alt: 'The terrace' }, className: 'aspect-square w-full object-cover' },
          ],
        },
      },
    },
  })
}
