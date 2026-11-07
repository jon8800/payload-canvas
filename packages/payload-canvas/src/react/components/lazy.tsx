'use client'

// The interactive block components, each in its own chunk. A route ships every client component
// its modules import, rendered or not, so a static import would put the carousel's JavaScript on
// every page. `next/dynamic` in a client module splits each one out: the server renders its HTML
// as usual (and preloads its chunk), and the browser loads it only on pages that render it.
//
// The implementations stay in their own files (`./Menu`, `./builtins/Carousel`, …); import those
// directly only where the chunk does not matter.

import dynamic from 'next/dynamic'
import type { BlockComponentProps } from '../render/types'
import type { CarouselLabels } from './builtins/Carousel'
import type { PopupLabels } from './builtins/Popup'
import type { TabsLabels } from './builtins/Tabs'
import { lazyBlock } from './lazyBlock'
import type { MenuLabels } from './Menu'

export const Menu = lazyBlock(dynamic<BlockComponentProps & { labels?: MenuLabels }>(() => import('./Menu').then((module) => module.Menu)))
export const Accordion = lazyBlock(dynamic<BlockComponentProps>(() => import('./builtins/Accordion').then((module) => module.Accordion)))
export const Carousel = lazyBlock(
  dynamic<BlockComponentProps & { labels?: CarouselLabels }>(() => import('./builtins/Carousel').then((module) => module.Carousel)),
)
export const FilterLink = lazyBlock(dynamic<BlockComponentProps>(() => import('./builtins/FilterLink').then((module) => module.FilterLink)))
export const Popup = lazyBlock(dynamic<BlockComponentProps & { labels?: PopupLabels }>(() => import('./builtins/Popup').then((module) => module.Popup)))
export const Tabs = lazyBlock(dynamic<BlockComponentProps & { labels?: TabsLabels }>(() => import('./builtins/Tabs').then((module) => module.Tabs)))
// Not blocks: the parts of the embed block that need JavaScript (`./builtins/Embed`).
export const EmbedHtml = dynamic(() => import('./builtins/EmbedHtml').then((module) => module.EmbedHtml))
export const EmbedPreview = dynamic(() => import('./builtins/EmbedPreview').then((module) => module.EmbedPreview))
export const Tab = lazyBlock(dynamic<BlockComponentProps>(() => import('./builtins/Tab').then((module) => module.Tab)))
