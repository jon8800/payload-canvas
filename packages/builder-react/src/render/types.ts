// Types shared by the renderer and the default components.

import type { ComponentType, ReactNode } from 'react'
import type { Block, BlockDefinition, Layout, TemplateContext } from '@payload-toolkit/builder/core'

/**
 * "site" renders the public page. "canvas" adds editor attributes and empty-slot placeholders.
 * In canvas mode, repeated collection list items after the first get `data-builder-repeat`
 * instead of editor attributes.
 */
export type RenderMode = 'site' | 'canvas'

/**
 * The stored value of a link group (`linkField()` from `@payload-toolkit/builder/blocks`).
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
  /** Spread on the element that directly contains each slot's children. */
  slotAttributes: Record<string, Record<string, string>>
  mode: RenderMode
}

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
}

/** Loads documents for a batch of ids in one collection. */
export type FetchDocs = (
  collection: string,
  ids: Array<string | number>,
) => Promise<Map<string | number, Record<string, unknown>>>
