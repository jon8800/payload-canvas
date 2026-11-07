// Read by the media backdrop component in the browser. A leaf module: no block definitions, so the
// component's JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

/**
 * Classes the backdrop component adds to the media and the overlay: they fill the block behind
 * its content. The block itself needs `relative isolate` (in its default className).
 */
export const MEDIA_BACKDROP_CLASS_MAP = classMap({
  media: 'pointer-events-none absolute inset-0 -z-10 size-full object-cover',
  overlay: 'pointer-events-none absolute inset-0 -z-10',
})
