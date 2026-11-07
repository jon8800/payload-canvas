// Read by the lightbox component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * Leaves an image out of every lightbox set: put it on the image or on an element round it. A click
 * on a skipped image still opens the set, at the photo with the same `src`. Use it for a large
 * photo that repeats one of the set's thumbnails.
 */
export const LIGHTBOX_SKIP_ATTRIBUTE = 'data-lightbox-skip'

/**
 * The event a lightbox sends when it closes, to the page image of the photo it showed last. It
 * bubbles; `detail.index` is the photo's place in the set. An image switcher can show that photo.
 */
export const LIGHTBOX_CLOSE_EVENT = 'lightbox-close'

/**
 * Classes the lightbox component adds itself: the position and size of the dialog and its
 * controls. No colours: those come from the block's className (see `LIGHTBOX_CLASS`).
 */
export const LIGHTBOX_CLASS_MAP = classMap({
  root: '[&_img:not([data-lightbox-photo])]:cursor-zoom-in',
  /** `touch-pan-y`: a sideways swipe reaches the script as pointer events (pinch zoom still works). */
  dialog: 'fixed inset-0 m-0 size-full max-h-none max-w-none touch-pan-y touch-pinch-zoom overflow-hidden bg-transparent p-0',
  /** One grid cell: the photo that leaves and the photo that comes in stack in it. */
  figure: 'm-0 box-border grid size-full grid-cols-1 grid-rows-1 place-items-center p-4 md:p-16',
  photo: 'col-start-1 row-start-1 max-h-full max-w-full object-contain',
  /** Shown when the photo takes longer than a moment to load. Its colour is the dialog's text colour. */
  loading: 'pointer-events-none absolute inset-0 m-auto size-8 animate-spin rounded-full border-2 border-current border-r-transparent',
  count: 'pointer-events-none absolute top-4 left-4 inline-flex min-h-11 items-center px-1',
  caption: 'absolute inset-x-0 bottom-4 px-16 text-center',
  hidden: 'sr-only',
  button: 'absolute inline-flex cursor-pointer items-center justify-center',
  close: 'top-4 right-4',
  previous: 'top-1/2 left-4 -translate-y-1/2',
  next: 'top-1/2 right-4 -translate-y-1/2',
  icon: 'size-5',
})

/** The lightbox's control labels and their English defaults. */
export const LIGHTBOX_LABELS = {
  closeLabel: 'Close',
  previousLabel: 'Previous photo',
  nextLabel: 'Next photo',
  countLabel: '{n} of {count}',
}
