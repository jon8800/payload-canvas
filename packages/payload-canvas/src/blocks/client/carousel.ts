// Read by the carousel component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * The classes a new carousel starts with on its parts (`block.partClassName`). Colours come from
 * the text colour (`current`), so the controls fit any background. The arrows and dots keep a hit
 * area of at least 24 px.
 */
export const CAROUSEL_PART_CLASSES = {
  slides: 'gap-4',
  arrow:
    'size-10 rounded-full border border-current/20 transition-colors hover:border-current/50 hover:bg-current/5 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ' +
    'disabled:opacity-30 disabled:hover:border-current/20 disabled:hover:bg-transparent',
  dot:
    'h-6 rounded-full px-1 after:h-1.5 after:w-1.5 after:rounded-full after:bg-current after:opacity-25 ' +
    'after:transition-[width,opacity] after:duration-300 hover:after:opacity-50 motion-reduce:after:transition-none ' +
    'aria-[current=true]:after:w-5 aria-[current=true]:after:opacity-100 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
  pause: 'h-10 rounded-full px-3 text-sm underline-offset-4 hover:underline',
}

/**
 * Classes the carousel component adds itself: how the viewport clips and the track lays out the
 * slides, and where the controls sit. The `*List` classes go on the track only when its one child
 * is a collection list or a repeat with a wrapper: that wrapper is unwrapped with
 * `display: contents`, so its items are the slides. One slide made by hand stays one slide. No
 * colours or sizes: those come from the block's className and the part classes.
 */
export const CAROUSEL_CLASS_MAP = classMap({
  viewport: 'overflow-hidden',
  track: 'flex touch-pan-y touch-pinch-zoom *:min-w-0 *:shrink-0',
  trackList: '*:contents [&>*>*]:min-w-0 [&>*>*]:shrink-0',
  /** Fade: every slide fills the viewport; the fade plugin stacks them. */
  fade: '*:basis-full',
  fadeList: '[&>*>*]:basis-full',
  controls: 'flex flex-wrap items-center justify-between gap-4',
  dots: 'flex flex-wrap items-center',
  arrows: 'ms-auto flex items-center gap-2',
  button: 'inline-flex cursor-pointer items-center justify-center disabled:cursor-default',
  /** The dot's visible mark is its `::after`. */
  dot: 'after:block',
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
