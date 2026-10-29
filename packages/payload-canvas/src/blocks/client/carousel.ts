// Read by the carousel component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * Classes the carousel component adds itself: how the track moves its slides and where the
 * controls sit. The `*List` classes go on the track only when its one child is a collection list
 * or a repeat with a wrapper: that wrapper is unwrapped with `display: contents`, so its items are
 * the slides. One slide made by hand stays one slide. No colours or sizes: those come from the
 * block's className (see `CAROUSEL_CLASS`).
 */
export const CAROUSEL_CLASS_MAP = classMap({
  scroll: 'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] *:shrink-0 *:snap-start',
  scrollList: '*:contents [&>*>*]:shrink-0 [&>*>*]:snap-start',
  fade: 'grid *:col-start-1 *:row-start-1 *:transition-opacity *:duration-500 motion-reduce:*:transition-none',
  fadeList:
    '*:contents [&>*>*]:col-start-1 [&>*>*]:row-start-1 [&>*>*]:transition-opacity [&>*>*]:duration-500 ' +
    'motion-reduce:[&>*>*]:transition-none',
  /** Until the script has counted the slides, only the first one shows. */
  fadeBefore: '[&>*:not(:first-child)]:opacity-0',
  fadeBeforeList: '[&>*>*:not(:first-child)]:opacity-0',
  fadeReady: '[&_[data-slide-off]]:pointer-events-none [&_[data-slide-off]]:opacity-0',
  controls: 'flex flex-wrap items-center justify-between gap-4',
  dots: 'flex flex-wrap items-center',
  arrows: 'ms-auto flex items-center gap-2',
  button: 'inline-flex cursor-pointer items-center justify-center disabled:cursor-default',
  icon: 'size-5',
})

/** The carousel's labels and their English defaults. */
export const CAROUSEL_LABELS = {
  label: 'Carousel',
  previousLabel: 'Previous slide',
  nextLabel: 'Next slide',
  pauseLabel: 'Pause',
  playLabel: 'Play',
  dotLabel: 'Slide {n}',
  slideLabel: '{n} of {count}',
  carouselRole: 'carousel',
  slideRole: 'slide',
}
