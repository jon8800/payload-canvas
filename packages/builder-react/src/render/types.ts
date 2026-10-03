// Types shared by the renderer and the default components.

import type { ComponentType, ReactNode } from 'react'
import type { Block, BlockDefinition, Layout } from '@payload-toolkit/builder/core'

/** "site" renders the public page. "canvas" adds editor attributes and empty-slot placeholders. */
export type RenderMode = 'site' | 'canvas'

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
}

/** Loads documents for a batch of ids in one collection. */
export type FetchDocs = (
  collection: string,
  ids: Array<string | number>,
) => Promise<Map<string | number, Record<string, unknown>>>
