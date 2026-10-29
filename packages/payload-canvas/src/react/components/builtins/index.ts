// Components of the opt-in built-in blocks (`builtinBlocks()` in `payload-canvas/blocks`).
// Client-safe: the site and the canvas use the same map.

import { createElement, type ComponentType } from 'react'
import { readsClientLinks, readsLinkComponent, withClientLinks, withLinkComponent } from '../../render/marks'
import type { BlockComponentProps, BlockComponents } from '../../render/types'
// The interactive blocks load their JavaScript only on pages that render them (see `../lazy`).
import { Accordion, Carousel, FilterLink, ImageViewer, Menu } from '../lazy'
import type { MenuLabels } from '../Menu'
import type { CarouselLabels } from './Carousel'
import { Disclosure } from './Disclosure'
import { iconComponent, type IconMap } from './Icon'
import type { ImageViewerLabels } from './ImageViewer'
import { mediaBackdropComponent, type MediaUrl } from './MediaBackdrop'
import { TableOfContents, type TableOfContentsLabels } from './TableOfContents'

/**
 * A site's labels, by block type: the text of controls and names for screen readers, used when a
 * block's own label prop is empty. Missing ones stay English. One place for a site's language;
 * a block can still override each label in its **Labels** props.
 */
export type BuiltinLabels = {
  carousel?: CarouselLabels
  imageViewer?: ImageViewerLabels
  tableOfContents?: TableOfContentsLabels
  /** The default menu block's labels. With them, the map includes a `menu` component. */
  menu?: MenuLabels
}

export type BuiltinComponentsOptions = {
  /** The site's icons by name, for the `icon` block. The same names as `builtinBlocks({ icons })`. */
  icons?: IconMap
  /**
   * Maps a stored media URL to the one the site serves, for the media backdrop's uploads. Example:
   * `(url) => new URL(url, 'http://x').pathname` serves absolute URLs from the current host.
   */
  mediaUrl?: MediaUrl
  /** The site's labels, for example in its language: `{ carousel: { nextLabel: 'Weiter' } }`. */
  labels?: BuiltinLabels
}

type Labelled<L> = ComponentType<BlockComponentProps & { labels?: L }>

const labelledCache = new WeakMap<object, WeakMap<object, ComponentType<BlockComponentProps>>>()

/** The component with the site's labels bound. One component per labels object, so React keeps the type. */
function withLabels<L extends object>(component: Labelled<L>, labels: L | undefined): ComponentType<BlockComponentProps> {
  if (!labels || Object.keys(labels).length === 0) return component
  let byLabels = labelledCache.get(component)
  if (!byLabels) labelledCache.set(component, (byLabels = new WeakMap()))
  const known = byLabels.get(labels)
  if (known) return known
  function WithLabels(props: BlockComponentProps) {
    return createElement(component, { ...props, labels })
  }
  if (readsLinkComponent(component)) withLinkComponent(WithLabels)
  if (readsClientLinks(component)) withClientLinks(WithLabels)
  byLabels.set(labels, WithLabels)
  return WithLabels
}

/**
 * The components of every built-in block. Merge them into your components map:
 * `{ ...builtinComponents({ icons, labels }), ...yours }`. A key of yours with the same type wins.
 * Components of blocks you did not include are never rendered. The interactive ones (carousel,
 * image viewer, accordion, filter link, menu) each load their JavaScript only on pages that render
 * them. Call it once (at module level), not during a render.
 */
export function builtinComponents(options: BuiltinComponentsOptions = {}): BlockComponents {
  const labels = options.labels ?? {}
  const components: BlockComponents = {
    disclosure: Disclosure,
    accordion: Accordion,
    imageViewer: withLabels(ImageViewer, labels.imageViewer),
    carousel: withLabels(Carousel, labels.carousel),
    tableOfContents: withLabels(TableOfContents, labels.tableOfContents),
    filterLink: FilterLink,
    mediaBackdrop: mediaBackdropComponent(options.mediaUrl),
  }
  if (options.icons) components.icon = iconComponent(options.icons)
  // The menu is a default block: it joins the map only when the site gives it labels.
  if (labels.menu && Object.keys(labels.menu).length > 0) components.menu = withLabels(withClientLinks(Menu), labels.menu)
  return components
}

export { Accordion, Carousel, FilterLink, ImageViewer } from '../lazy'
export type { CarouselLabels } from './Carousel'
export { Disclosure } from './Disclosure'
export { iconComponent, type IconComponent, type IconMap } from './Icon'
export type { ImageViewerLabels } from './ImageViewer'
export { MediaBackdrop, mediaBackdropComponent, type MediaUrl } from './MediaBackdrop'
export { SectionRef } from './SectionRef'
export { TableOfContents, type TableOfContentsLabels } from './TableOfContents'
