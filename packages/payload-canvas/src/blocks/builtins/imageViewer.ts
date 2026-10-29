import { defineBlock } from '../../core/blocks'
import type { BlockDefinition } from '../../core/types'
import { IMAGE_VIEWER_CLASS_MAP, IMAGE_VIEWER_LABELS } from '../client/imageViewer'
import { classesOf, labelField, labelsField, labelsHelp } from './shared'

export { IMAGE_VIEWER_CLASS_MAP, IMAGE_VIEWER_LABELS }

export const IMAGE_VIEWER_BLOCK = 'imageViewer'

const LABEL_NAMES = { closeLabel: 'Close button', previousLabel: 'Previous button', nextLabel: 'Next button', countLabel: 'Photo number' }

const IMAGE_VIEWER_CLASS =
  'grid grid-cols-2 gap-3 md:grid-cols-3 [&_dialog]:text-white [&_dialog]:backdrop:bg-black/85 ' +
  '[&_[data-viewer-button]]:size-11 [&_[data-viewer-button]]:rounded-full [&_[data-viewer-button]]:bg-black/50'

export function imageViewerBlock(): BlockDefinition {
  return defineBlock({
    type: IMAGE_VIEWER_BLOCK,
    label: 'Image viewer',
    icon: 'imageViewer',
    category: 'Media',
    fields: [
      labelField('label', IMAGE_VIEWER_LABELS.label, 'Name of the photo popup for screen readers'),
      {
        name: 'group',
        type: 'text',
        label: 'Group',
        admin: { description: 'Image viewers with the same group on a page open as one set. Optional.' },
      },
      { name: 'captions', type: 'checkbox', label: 'Show the alt text as a caption', defaultValue: false },
      labelsField(IMAGE_VIEWER_LABELS, LABEL_NAMES),
    ],
    slots: { children: { label: 'Content' } },
    defaultClassName: IMAGE_VIEWER_CLASS,
    classes: classesOf(IMAGE_VIEWER_CLASS_MAP),
    ai: {
      description:
        'A container whose images open full screen in a photo popup (a modal dialog): a click, or Enter on a focused image. ' +
        'Arrow keys, a sideways swipe on touch screens and the arrow buttons step through the images; Escape closes. Image ' +
        'viewers with the same "group" open as one set. Lay out the images with its className (a grid), or put a repeat of ' +
        'images in it (path "gallery", image bound to "$item"). Style the popup from the className: [&_dialog]: for ' +
        'its text colour and backdrop ([&_dialog]:backdrop:bg-black/85), [&_[data-viewer-button]]: for the close, previous ' +
        'and next buttons, [&_[data-viewer-photo]]: for the large photo. The canvas does not open it.' +
        labelsHelp(IMAGE_VIEWER_LABELS) +
        ' In "countLabel", {n} is the photo number and {count} the number of photos.',
      example: {
        type: IMAGE_VIEWER_BLOCK,
        props: { label: 'Gallery' },
        className: IMAGE_VIEWER_CLASS,
        slots: {
          children: [
            { id: 'b_example_1', type: 'image', props: { image: 1, alt: 'The office' }, className: 'aspect-square w-full object-cover' },
            { id: 'b_example_2', type: 'image', props: { image: 2, alt: 'The team at work' }, className: 'aspect-square w-full object-cover' },
          ],
        },
      },
    },
  })
}
