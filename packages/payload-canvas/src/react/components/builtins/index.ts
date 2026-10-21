// Components of the opt-in built-in blocks (`builtinBlocks()` in `payload-canvas/blocks`).
// Client-safe: the site and the canvas use the same map.

import type { BlockComponents } from '../../render/types'
import { Accordion } from './Accordion'
import { Carousel } from './Carousel'
import { Disclosure } from './Disclosure'
import { iconComponent, type IconMap } from './Icon'
import { Lightbox } from './Lightbox'
import { TableOfContents } from './TableOfContents'

export type BuiltinComponentsOptions = {
  /** The site's icons by name, for the `icon` block. The same names as `builtinBlocks({ icons })`. */
  icons?: IconMap
}

/**
 * The components of every built-in block. Merge them into your components map:
 * `{ ...builtinComponents({ icons }), ...yours }`. A key of yours with the same type wins.
 * Components of blocks you did not include are never rendered. To keep their code out of the
 * bundle, import single components (`Carousel`, `Lightbox`, …) instead.
 */
export function builtinComponents(options: BuiltinComponentsOptions = {}): BlockComponents {
  const components: BlockComponents = { disclosure: Disclosure, accordion: Accordion, lightbox: Lightbox, carousel: Carousel, tableOfContents: TableOfContents }
  if (options.icons) components.icon = iconComponent(options.icons)
  return components
}

export { Accordion } from './Accordion'
export { Carousel } from './Carousel'
export { Disclosure } from './Disclosure'
export { iconComponent, type IconComponent, type IconMap } from './Icon'
export { Lightbox } from './Lightbox'
export { TableOfContents } from './TableOfContents'
