import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { LIGHTBOX_CLASS_MAP, LIGHTBOX_LABELS } from '../client/lightbox'
import { classesOf, labelsField, labelsHelp } from './shared'

export { LIGHTBOX_CLASS_MAP, LIGHTBOX_CLOSE_EVENT, LIGHTBOX_LABELS, LIGHTBOX_SKIP_ATTRIBUTE } from '../client/lightbox'

export const LIGHTBOX_BLOCK = 'lightbox'


const LABEL_NAMES = { closeLabel: 'Close button', previousLabel: 'Previous button', nextLabel: 'Next button', countLabel: 'Photo number' }

const LIGHTBOX_CLASS =
  'grid grid-cols-2 gap-3 md:grid-cols-3 [&_dialog]:text-white [&_dialog]:backdrop:bg-black/85 ' +
  '[&_[data-lightbox-button]]:size-11 [&_[data-lightbox-button]]:rounded-full [&_[data-lightbox-button]]:bg-black/50'

export function lightboxBlock(): BlockDefinition {
  return defineBlock({
    type: LIGHTBOX_BLOCK,
    label: 'Lightbox',
    icon: 'lightbox',
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
      { name: 'count', type: 'checkbox', label: 'Show the photo number', defaultValue: true },
      labelsField(LIGHTBOX_LABELS, LABEL_NAMES),
    ],
    slots: { children: { label: 'Content' } },
    defaultClassName: LIGHTBOX_CLASS,
    classes: classesOf(LIGHTBOX_CLASS_MAP),
    ai: {
      description:
        'A container whose images open full screen in a modal dialog: a click, or Enter on a focused image. Arrow keys, a ' +
        'sideways swipe on touch screens and the arrow buttons step through the images; Escape closes. Lightboxes with the same "group" open as one set; ' +
        'each photo shows once in a set (by its src). The dialog fades in and out and the photos slide when they step (fades only under reduced motion). ' +
        '"count" (default on) shows "2 of 6" at the top left. Lay out the ' +
        'images with its className (a grid), or put a repeat of images in it (path "galleryImages", image bound to "$item"). ' +
        'Style the dialog from the className: [&_dialog]: for its text colour and backdrop ([&_dialog]:backdrop:bg-black/85), ' +
        '[&_[data-lightbox-button]]: for the close, previous and next buttons, [&_[data-lightbox-photo]]: for the large photo, ' +
        '[&_[data-lightbox-count]]: for the photo number, [&_[data-lightbox-loading]]: for the ring shown while a photo loads. ' +
        'The canvas does not open it.' +
        labelsHelp(LIGHTBOX_LABELS) +
        ' In "countLabel", {n} is the photo number and {count} the number of photos.',
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
