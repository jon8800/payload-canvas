// Types shared by the renderer and the default components.

import type { AnchorHTMLAttributes, ComponentType, ReactNode } from 'react'
import type { BindingRelations, Block, BlockDefinition, Layout, TemplateContext } from '../../core'

/**
 * "site" renders the public page. "canvas" adds editor attributes and empty-slot placeholders.
 * In canvas mode, repeated collection list items after the first get `data-builder-repeat`
 * instead of editor attributes.
 */
export type RenderMode = 'site' | 'canvas'

/**
 * The stored value of a link group (`linkField()` from `payload-canvas/blocks`).
 * `reference.value` is the loaded document after `resolveLayoutData`, or still an ID.
 */
export type LinkValue = {
  type?: 'url' | 'reference' | null
  url?: string | null
  reference?: { relationTo: string; value: unknown } | null
  newTab?: boolean | null
}

/**
 * What a block component receives for a link group: the stored value plus the resolved `<a>`
 * attributes. `href` is `null` when the link goes nowhere (render without an `<a>`).
 */
export type ResolvedLink = LinkValue & {
  href: string | null
  target?: '_blank'
  rel?: string
}

/** Turns a link into an href. `null` means "no link": the block renders without an `<a>`. */
export type ResolveLink = (link: LinkValue) => string | null

/**
 * What every block component receives. **Props are plain data; custom components may be client
 * components** (`'use client'`). RenderLayout passes no functions, so a server-rendered layout can
 * hand these props to a client component.
 *
 * - Link groups (`linkField()`) arrive resolved as `ResolvedLink`: read `href`, `target` and `rel`,
 *   or use `linkAttributes(props.link)`. The resolver itself never reaches components.
 * - Upload and relationship props hold loaded documents when the page loaded them
 *   (`loadLayoutData`), otherwise IDs.
 * - Rich text props are Lexical JSON. The built-in `richText` component resolves internal links
 *   with RenderLayout's `resolveLink`. A custom component that renders rich text imports its own
 *   resolver. In the editor, rich text props use the editor config of the first `richText` field
 *   in the block definitions, or the app's default editor.
 */
export type BlockComponentProps = {
  /** The stored block (raw props, className, slots data). Prefer `props` and `slots` below. */
  block: Block
  /** Props after data loading and link resolution. */
  props: Record<string, unknown>
  className?: string
  /** Rendered children per slot name. */
  slots: Record<string, ReactNode>
  /** Spread on the component's root element. In canvas mode it holds `data-block-id`. */
  attributes: Record<string, string>
  /**
   * By slot or part name. Spread a slot's entry on the element that directly contains the slot's
   * children (in the canvas it marks the drop zone). A part's entry (a slot with `styles: true`
   * or a name in `BlockDefinition.parts`) carries the part's `className`, with the `builder-css`
   * marker: join it with the element's own classes. Always set for every slot and part.
   */
  partAttributes: Record<string, Record<string, string>>
  /** @deprecated The same object as `partAttributes` (its name before 0.4). */
  slotAttributes?: Record<string, Record<string, string>>
  mode: RenderMode
  /**
   * The page data (`RenderLayout`'s `pageData`; in the canvas, the `pageData` loader of
   * `createCanvasServer`). Only components marked with `withPageData` get it, and every
   * `fromPayloadComponent` component.
   */
  pageData?: PageData
  /**
   * Set only when the block renders on the server for the editor (`createCanvasServer`):
   * `'canvas'`, or `'thumbnail'` for the pictures of the section library. Missing on the site.
   * Server components read this; client components call `useCanvasMode()` instead.
   */
  canvasMode?: 'canvas' | 'thumbnail'
  /**
   * The site's link component (`RenderLayout`'s `linkComponent`, for example `next/link`). Only
   * components marked with `withLinkComponent` get it, and only on the site. Render it in place
   * of `<a>` when it is set. Server components only: a function cannot reach a client component.
   */
  linkComponent?: LinkComponent
  /**
   * Set on the site when `RenderLayout` has a `linkComponent`, for client components marked with
   * `withClientLinks`. Render `next/link` in place of `<a>` when it is true.
   */
  clientLinks?: boolean
}

/** What a link component gets: the `<a>` attributes, with `href` always set. */
export type LinkComponentProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/**
 * Renders a link in place of `<a>`, for example `next/link` for client-side navigation and
 * prefetching. Server-rendered blocks get it as a prop. Client blocks cannot get a function from the
 * server (Next's server `next/link` is one), so they get `clientLinks` and render `next/link` themselves.
 */
export type LinkComponent = ComponentType<LinkComponentProps>

/** Data the page loads once for all its blocks, for example a list of services or review totals. */
export type PageData = Record<string, unknown>

export type BlockComponents = Record<string, ComponentType<BlockComponentProps>>

export type RenderLayoutProps = {
  layout: Layout
  /** Overrides or additions, merged over `defaultComponents`. */
  components?: BlockComponents
  /** Generated CSS for the layout's classes (from the plugin's save hook). Rendered in a <style> tag. */
  css?: string | null
  mode?: RenderMode
  /**
   * The block definitions, the same list as the plugin config. They tell the renderer which props
   * are link groups and, in canvas mode, which slots each block type has (so an empty slot gets a
   * drop placeholder). Default: `defaultBlocks()`. A block type with no definition gets a
   * "children" slot in canvas mode and no link resolution.
   */
  blocks?: BlockDefinition[]
  /**
   * Maps links (link groups and internal rich text links) to an href. Default: the URL for
   * URL links, `/${slug}` for a loaded document with a `slug`, otherwise no link. It also gives the
   * `$url` binding path its value.
   */
  resolveLink?: ResolveLink
  /**
   * The document a template renders. Bound props (`block.bindings`) and Field blocks read it.
   * Load it with `depth: 1` and pass the same context to `loadLayoutData`.
   */
  context?: TemplateContext | null
  /**
   * Which collection each relationship field points to (`bindingRelations`), for `<path>.$url`
   * bindings such as `categories.0.$url`. Sites leave it out: `loadLayoutData` reads it from the
   * Payload config and gives it to the collection lists and repeats that need it. The canvas,
   * which has no Payload config, gets it from the plugin.
   */
  relations?: BindingRelations | null
  /**
   * Data the page loads once for all its blocks (plain data). Components marked with
   * `withPageData`, and `fromPayloadComponent` components, get it as `pageData`. In the canvas it
   * comes from the `pageData` loader of `createCanvasServer`: use the same loader on the site.
   */
  pageData?: PageData | null
  /**
   * Renders the links of the built-in button, link and menu blocks (and of components marked with
   * `withLinkComponent`) on the site. Default: a plain `<a>`. Pass `next/link` for client-side
   * navigation and prefetching. Server-rendered blocks render it; client blocks marked with
   * `withClientLinks` (the menu) get `clientLinks: true` and render `next/link`. Ignored in the editor canvas.
   */
  linkComponent?: LinkComponent | null
  /**
   * How many images of the layout's first section load first (`fetchpriority="high"`, not lazy):
   * image blocks (and other blocks with a `priority` prop), in page order, unless their **Load first** prop
   * is off. Default `1`: the first image of the first section, often the largest thing on screen.
   * Give a layout further down the page (a footer) `0`. Site only.
   */
  priorityImages?: number
  /**
   * Site only. Default `true`: when an accordion in the layout has "Mark up as FAQ for search
   * engines" on (`faqSchema`), the layout outputs one `<script type="application/ld+json">` with
   * FAQPage data for those items (`faqItems`, `faqJsonLd`). `false` leaves it out, for a site that
   * outputs its own.
   */
  faqJsonLd?: boolean
}

/** Loads documents for a batch of ids in one collection. */
export type FetchDocs = (
  collection: string,
  ids: Array<string | number>,
) => Promise<Map<string | number, Record<string, unknown>>>
