// Components of the opt-in built-in blocks (`builtinBlocks()` in `payload-canvas/blocks`).
// Client-safe: the site and the canvas use the same map.

import { createElement, type ComponentType } from 'react'
import { readsClientLinks, readsLinkComponent, withClientLinks, withLinkComponent } from '../../render/marks'
import type { BlockComponentProps, BlockComponents } from '../../render/types'
import { buttonComponent } from '../Button'
// The interactive blocks load their JavaScript only on pages that render them (see `../lazy`).
import { Accordion, Carousel, FilterLink, Menu, Popup, Tab, Tabs } from '../lazy'
import type { MenuLabels } from '../Menu'
import { AdjacentLinks, type AdjacentLinksLabels } from './AdjacentLinks'
import type { CarouselLabels } from './Carousel'
import { Disclosure } from './Disclosure'
import { Embed, type EmbedLabels } from './Embed'
import { iconComponent, type IconMap } from './Icon'
import { Lightbox } from './Lightbox'
import { Marquee } from './Marquee'
import { mediaBackdropComponent, type MediaUrl } from './MediaBackdrop'
import type { PopupLabels } from './Popup'
import { TableOfContents, type TableOfContentsLabels } from './TableOfContents'
import type { TabsLabels } from './Tabs'

/**
 * A site's labels, by block type: the text of controls and names for screen readers, used when a
 * block's own label prop is empty. Missing ones stay English. One place for a site's language;
 * a block can still override each label in its **Labels** props.
 */
export type BuiltinLabels = {
  carousel?: CarouselLabels
  popup?: PopupLabels
  tabs?: TabsLabels
  tableOfContents?: TableOfContentsLabels
  adjacentLinks?: AdjacentLinksLabels
  embed?: EmbedLabels
  /** The default menu block's labels. With them, the map includes a `menu` component. */
  menu?: MenuLabels
}

export type BuiltinComponentsOptions = {
  /**
   * The site's icons by name, for the `icon` block and the button's `icon` prop. The same names as
   * `builtinBlocks({ icons })` and `defaultBlocks({ icons })`.
   */
  icons?: IconMap
  /** The site's labels, for example in its language: `{ carousel: { nextLabel: 'Weiter' } }`. */
  labels?: BuiltinLabels
  /**
   * Maps a stored media URL to the one the site serves, for the media backdrop's uploads. Example:
   * `(url) => new URL(url, 'http://x').pathname` serves absolute URLs from the current host.
   */
  mediaUrl?: MediaUrl
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
 * popup, tabs, accordion, filter link, menu, inline embed) each load their JavaScript only on pages
 * that render them. Call it once (at module level), not during a render.
 */
export function builtinComponents(options: BuiltinComponentsOptions = {}): BlockComponents {
  const labels = options.labels ?? {}
  const components: BlockComponents = {
    disclosure: Disclosure,
    accordion: Accordion,
    popup: withLabels(Popup, labels.popup),
    lightbox: Lightbox,
    tabs: withLabels(Tabs, labels.tabs),
    tab: Tab,
    carousel: withLabels(Carousel, labels.carousel),
    marquee: Marquee,
    tableOfContents: withLabels(TableOfContents, labels.tableOfContents),
    filterLink: FilterLink,
    adjacentLinks: withLabels(AdjacentLinks, labels.adjacentLinks),
    embed: withLabels(Embed, labels.embed),
    mediaBackdrop: mediaBackdropComponent(options.mediaUrl),
  }
  if (options.icons) {
    components.icon = iconComponent(options.icons)
    components.button = buttonComponent(options.icons)
  }
  // The menu is a default block: it joins the map only when the site gives it labels.
  if (labels.menu && Object.keys(labels.menu).length > 0) components.menu = withLabels(withClientLinks(Menu), labels.menu)
  return components
}

export { buttonComponent } from '../Button'
export { Accordion, Carousel, FilterLink, Popup, Tab, Tabs } from '../lazy'
export { AdjacentLinks, type AdjacentLinksLabels } from './AdjacentLinks'
export type { CarouselLabels } from './Carousel'
export { Disclosure } from './Disclosure'
export { Embed, type EmbedLabels } from './Embed'
export { iconComponent, type IconComponent, type IconMap } from './Icon'
export { Lightbox } from './Lightbox'
export { Marquee } from './Marquee'
export { MediaBackdrop, mediaBackdropComponent, type MediaUrl } from './MediaBackdrop'
export type { PopupLabels } from './Popup'
export { SectionRef } from './SectionRef'
export { TableOfContents, type TableOfContentsLabels } from './TableOfContents'
export type { TabsLabels } from './Tabs'
