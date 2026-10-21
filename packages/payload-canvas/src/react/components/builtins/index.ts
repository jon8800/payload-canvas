// Components of the opt-in built-in blocks (`builtinBlocks()` in `payload-canvas/blocks`).
// Client-safe: the site and the canvas use the same map.

import type { BlockComponents } from '../../render/types'
import { buttonComponent } from '../Button'
import { Accordion } from './Accordion'
import { Carousel } from './Carousel'
import { Disclosure } from './Disclosure'
import { FilterLink } from './FilterLink'
import { iconComponent, type IconMap } from './Icon'
import { Lightbox } from './Lightbox'
import { mediaBackdropComponent, type MediaUrl } from './MediaBackdrop'
import { SectionRef } from './SectionRef'
import { TableOfContents } from './TableOfContents'

export type BuiltinComponentsOptions = {
  /**
   * The site's icons by name, for the `icon` block and the button's `icon` prop. The same names as
   * `builtinBlocks({ icons })` and `defaultBlocks({ icons })`.
   */
  icons?: IconMap
  /**
   * Maps a stored media URL to the one the site serves, for the media backdrop's uploads. Example:
   * `(url) => new URL(url, 'http://x').pathname` serves absolute URLs from the current host.
   */
  mediaUrl?: MediaUrl
}

/**
 * The components of every built-in block. Merge them into your components map:
 * `{ ...builtinComponents({ icons }), ...yours }`. A key of yours with the same type wins.
 * Components of blocks you did not include are never rendered. To keep their code out of the
 * bundle, import single components (`Carousel`, `Lightbox`, …) instead.
 */
export function builtinComponents(options: BuiltinComponentsOptions = {}): BlockComponents {
  const components: BlockComponents = { disclosure: Disclosure, accordion: Accordion, lightbox: Lightbox, carousel: Carousel, tableOfContents: TableOfContents, filterLink: FilterLink, mediaBackdrop: mediaBackdropComponent(options.mediaUrl), sectionRef: SectionRef }
  if (options.icons) {
    components.icon = iconComponent(options.icons)
    components.button = buttonComponent(options.icons)
  }
  return components
}

export { buttonComponent } from '../Button'
export { Accordion } from './Accordion'
export { Carousel } from './Carousel'
export { Disclosure } from './Disclosure'
export { FilterLink } from './FilterLink'
export { iconComponent, type IconComponent, type IconMap } from './Icon'
export { Lightbox } from './Lightbox'
export { MediaBackdrop, mediaBackdropComponent, type MediaUrl } from './MediaBackdrop'
export { SectionRef } from './SectionRef'
export { TableOfContents } from './TableOfContents'
