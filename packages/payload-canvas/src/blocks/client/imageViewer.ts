// Read by the image viewer component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * Classes the image viewer component adds itself: the position and size of the dialog and its
 * controls. No colours: those come from the block's className (see `IMAGE_VIEWER_CLASS`).
 */
export const IMAGE_VIEWER_CLASS_MAP = classMap({
  root: '[&_img:not([data-viewer-photo])]:cursor-zoom-in',
  /** `touch-pan-y`: a sideways swipe reaches the script as pointer events (pinch zoom still works). */
  dialog: 'fixed inset-0 m-0 size-full max-h-none max-w-none touch-pan-y touch-pinch-zoom overflow-hidden bg-transparent p-0',
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

/** The image viewer's labels and their English defaults. */
export const IMAGE_VIEWER_LABELS = {
  label: 'Photos',
  closeLabel: 'Close',
  previousLabel: 'Previous photo',
  nextLabel: 'Next photo',
  countLabel: '{n} of {count}',
}
