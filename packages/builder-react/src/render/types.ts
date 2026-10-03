// Types shared by the renderer and the default components.

import type { ComponentType, ReactNode } from 'react'
import type { Block, BlockDefinition, Layout } from '@payload-toolkit/builder/core'

/** "site" renders the public page. "canvas" adds editor attributes and empty-slot placeholders. */
export type RenderMode = 'site' | 'canvas'

/**
 * The value of a link group (the `link` prop of the button and link blocks).
 * `reference.value` is the loaded document after `resolveLayoutData`, or still an ID.
 */
export type LinkValue = {
  type?: 'url' | 'reference' | null
  url?: string | null
  reference?: { relationTo: string; value: unknown } | null
  newTab?: boolean | null
}

/** Turns a link into an href. `null` means "no link": the block renders without an `<a>`. */
export type ResolveLink = (link: LinkValue) => string | null

export type BlockComponentProps = {
  block: Block
  /** Props after data loading (upload/relationship IDs replaced by documents when loaded). */
  props: Record<string, unknown>
  className?: string
  /** Rendered children per slot name. */
  slots: Record<string, ReactNode>
  /** Spread on the component's root element. In canvas mode it holds `data-block-id`. */
  attributes: Record<string, string>
  /** Spread on the element that directly contains each slot's children. */
  slotAttributes: Record<string, Record<string, string>>
  mode: RenderMode
  /** The renderer's link resolver (RenderLayout's `resolveLink`, or the default one). */
  resolveLink: ResolveLink
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
   * Optional block definitions. In canvas mode they tell the renderer which slots each block type
   * has, so an empty slot gets a drop placeholder even when the data has no entry for it.
   * Without them, canvas mode assumes every block has a "children" slot.
   */
  blocks?: BlockDefinition[]
  /**
   * Maps links (button, link block, internal rich text links) to an href. Default: the URL for
   * URL links, `/${slug}` for a loaded document with a `slug`, otherwise no link.
   */
  resolveLink?: ResolveLink
}

/** Loads documents for a batch of ids in one collection. */
export type FetchDocs = (
  collection: string,
  ids: Array<string | number>,
) => Promise<Map<string | number, Record<string, unknown>>>
